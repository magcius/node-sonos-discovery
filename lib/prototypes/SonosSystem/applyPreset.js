'use strict';
const logger = require('../../helpers/logger');
require('../../polyfills/Array.includes');

function setVolume(system, playerPresets) {
  let initialPromise = Promise.resolve();
  let players = [];

  return playerPresets.reduce((promise, playerInfo) => {
    let player = system.getPlayer(playerInfo.roomName);
    if (!player) {
      return promise;
    }

    return promise.then(() => {
      players.push(player);
      if (playerInfo.hasOwnProperty('volume')) {
        logger.debug(`setting volume ${playerInfo.volume} on ${player.roomName}`);
        return player.setVolume(playerInfo.volume);
      }
    });
  }, initialPromise).then(() => {
    return players;
  });
}

function pauseOthers(system, presetPlayers) {
  const presetPlayerUuids = presetPlayers.map(player => player.uuid);

  const initialPromise = Promise.resolve();
  return system.zones
    .filter(zone => presetPlayerUuids.includes(zone.uuid) === false)
    .reduce((promise, zone) => {
    return promise.then(() => {
      logger.debug(`pausing ${zone.coordinator.roomName}`);
      return zone.coordinator.pause()
        .catch((err) => {
        });
    });
  }, initialPromise);
}

function groupWithCoordinator(players) {
  let initialPromise = Promise.resolve();
  let coordinator = players[0];
  let groupingUri = `x-rincon:${coordinator.uuid}`;

  // Skip first player since it is coordinator
  return players.slice(1)
    .reduce((promise, player) => {

      if (player.avTransportUri === groupingUri) {
        logger.debug(`skipping grouping for ${player.roomName} because it is already grouped with coordinator`);
        return promise;
      }

      logger.debug(`adding ${player.roomName} to coordinator ${coordinator.roomName}`);
      return promise.then(() => player.setAVTransport(groupingUri));
    }, initialPromise);
}

function ungroupFromCoordinator(system, players) {
  // Find zone
  let coordinator = players[0];
  let zone = system.zones.find((x) => {
    return x.uuid === coordinator.uuid;
  });

  let playerNames = players.map((player) => {
    return player.roomName;
  });
  let superfluousPlayers = zone.members.filter((member) => {
    return playerNames.indexOf(member.roomName) === -1;
  });

  return superfluousPlayers.reduce((promise, player) => {
    logger.debug(`ungrouping ${player.roomName} from coordinator ${coordinator.roomName}`);
    return promise.then(() => player.becomeCoordinatorOfStandaloneGroup());
  }, Promise.resolve());

}

function applyPreset(preset) {
  let promise = Promise.resolve();
  let players;
  let coordinator;

  promise = promise.then(() => {
    players = preset.players.map(playerInfo => this.getPlayer(playerInfo.roomName));
  });

  promise = promise.then(() => {
    // store coordinator for future use
    coordinator = players[0];
    logger.debug(`coordinator is ${coordinator.roomName}`);

    // If the first player needs to be broken out, do that before we group the other players with it.
    if (coordinator.coordinator.uuid !== coordinator.uuid) {
      logger.debug(`breaking out ${coordinator.roomName}`);
      return coordinator.becomeCoordinatorOfStandaloneGroup()
        .then(() => groupWithCoordinator(players));
    }

    return groupWithCoordinator(players).then(() => {
      // This only needs to happen if we didn't ungroup the coordinator
      return ungroupFromCoordinator(this, players);
    });
  });

  if (preset.pauseOthers) {
    promise = promise.then(() => pauseOthers(this, players));
  }

  promise = promise.then(() => setVolume(this, preset.players));

  if (preset.favorite) {
    promise = promise.then(() => coordinator.replaceWithFavorite(preset.favorite));
  } else if (preset.playlist) {
    promise = promise.then(() => coordinator.replaceWithPlaylist(preset.playlist));
  } else if (preset.uri) {
    promise = promise.then(() => coordinator.setAVTransport(preset.uri, preset.metadata));
  }

  if (preset.playMode) {
    promise = promise.then(() => coordinator.setPlayMode(preset.playMode));
  }

  if (preset.trackNo) {
    promise = promise.then(() => coordinator.trackSeek(preset.trackNo));
  }

  if (preset.elapsedTime) {
    promise = promise.then(() => coordinator.timeSeek(preset.elapsedTime));
  }

  if (preset.sleep) {
    promise = promise.then(() => coordinator.sleep(preset.sleep));
  }

  if (!preset.state || preset.state.toLowerCase() === 'playing') {
    promise = promise.then(() => coordinator.play());
  }

  return promise;
}

module.exports = applyPreset;

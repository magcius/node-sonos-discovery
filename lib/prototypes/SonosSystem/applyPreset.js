'use strict';

function setVolume(system, playerPresets) {
  let initialPromise = Promise.resolve();
  let players = [];

  return playerPresets.reduce((promise, playerInfo) => {
    return promise.then(() => {
      let player = system.getPlayer(playerInfo.roomName);
      players.push(player);
      if (playerInfo.hasOwnProperty('volume')) {
        return player.setVolume(playerInfo.volume);
      }
    });
  }, initialPromise).then(() => {
    return players;
  });
}

function pauseOthers(system) {
  let initialPromise = Promise.resolve();
  return system.zones.reduce((promise, zone) => {
    return promise.then(() => {
      return zone.coordinator.pause();
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
    return promise.then(() => player.becomeCoordinatorOfStandaloneGroup());
  }, Promise.resolve());

}

function applyPreset(preset) {
  var promise = Promise.resolve();
  var coordinator;
  if (preset.pauseOthers) {
    promise = promise.then(() => pauseOthers(this));
  }

  promise = promise.then(() => setVolume(this, preset.players));

  promise = promise.then((players) => {
    // store coordinator for future use
    coordinator = players[0];

    // If the first player needs to be broken out, do that before we group the other players with it.
    if (preset.players.length === 1 || coordinator.coordinator.uuid !== coordinator.uuid) {
      return coordinator.becomeCoordinatorOfStandaloneGroup()
        .then(() => groupWithCoordinator(players));
    }

    return groupWithCoordinator(players).then(() => {
      // This only needs to happen if we didn't ungroup the coordinator
      return ungroupFromCoordinator(this, players);
    });
  });

  if (preset.playMode) {
    promise = promise.then(() => coordinator.setPlayMode(preset.playMode));
  }

  if (preset.favorite) {
    promise = promise.then(() => coordinator.replaceWithFavorite(preset.favorite));
  } else if (preset.uri) {
    promise = promise.then(() => coordinator.setAVTransport(preset.uri));
  }

  if (preset.trackNo) {
    promise = promise.then(() => coordinator.trackSeek(preset.trackNo));
  }

  if (preset.elapsedTime) {
    promise = promise.then(() => coordinator.timeSeek(preset.elapsedTime));
  }

  return promise;
}

module.exports = applyPreset;
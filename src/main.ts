import {
  getMapData,
  MapData,
  MapView,
  Marker,
  show3dMap,
  Space,
  TGetMapDataOptions,
  TBlueDotPositionUpdate,
} from "@mappedin/mappedin-js";
import "@mappedin/mappedin-js/lib/index.css";
import { generatePositionUpdates } from "./generator";
import { populateSpaceSelector } from "./spaceSelector";
import { populateFloorSelector } from "./floorSelector";
import { setSelectedFloor } from "./floorSelector";
import { saveTemplateAsFile } from "./fileDownloader";
import { DynamicPositionUpdater } from "./positionUpdater";

// See Trial API key Terms and Conditions
// https://developer.mappedin.com/docs/demo-keys-and-maps
const DEMO_KEY = "mik_1YlSdV9drsYtVjmEo555607d4";
const DEMO_SECRET = "mis_3yPjFAkOAKGx8m80DYFPTCfYwEwgFBBEoopIUIPWity7ce0100c";
const DEMO_MAP_ID = "67dd806506b0a1000b97bae7";

let mapData: MapData;
let mapView: MapView;

let blueDotEnabled = false;

let positions: TBlueDotPositionUpdate[] | undefined;

const fakePositionUpdater = new DynamicPositionUpdater();

/**
 * Get UI elements
 */

// Venue settings
const mapIdInput = document.getElementById("mapId")! as HTMLInputElement;
const clientIdInput = document.getElementById("key")! as HTMLInputElement;
const clientSecretInput = document.getElementById(
  "secret"
)! as HTMLInputElement;
const environmentSelect = document.getElementById(
  "environment"
)! as HTMLSelectElement;

const loadMapButton = document.getElementById("loadMap")! as HTMLButtonElement;

// Data settings
const startSpaceSelector = document.getElementById(
  "startSpace"
)! as HTMLSelectElement;

const endSpaceSelector = document.getElementById(
  "endSpace"
)! as HTMLSelectElement;

// Playback settings
const showPathCheckbox = document.getElementById(
  "showPath"
)! as HTMLInputElement;

// Controls
const generateButton = document.getElementById(
  "generate"
)! as HTMLButtonElement;
const downloadButton = document.getElementById(
  "download"
)! as HTMLButtonElement;
const resetButton = document.getElementById("reset")! as HTMLButtonElement;

const startLocationColor = document.getElementById(
  "startLocationColor"
) as HTMLInputElement;

const destinationLocationColor = document.getElementById(
  "destinationLocationColor"
) as HTMLInputElement;
/**
 * Configure button click handlers
 */

// Get the currently configured venue options
const getMapDataOptionsWithFallbacks = (): TGetMapDataOptions => {
  const options: TGetMapDataOptions = {
    mapId: DEMO_MAP_ID,
    //mapID: mapIdInput.value
    //key: clientIdInput.value === "" ? DEMO_KEY : clientIdInput.value,
    key: DEMO_KEY,
    secret: DEMO_SECRET,
    environment: environmentSelect.value as "us" | "eu",
  };
  return options;
};

let previousColouredStart: Space | undefined;
function onStartSpaceChange(event: any) {
  if (previousColouredStart) {
    mapView.updateState(previousColouredStart, {
      color: "initial",
    });
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, {
      color: startLocationColor.value,
    });
    previousColouredStart = spaceToColor;
  }
}
startSpaceSelector.onchange = onStartSpaceChange;

let previousColouredEnd: Space | undefined;
function onEndSpaceChange(event: any) {
  if (previousColouredEnd) {
    mapView.updateState(previousColouredEnd, {
      color: "initial",
    });
  }

  const spaceToColor = mapData
    .getByType("space")
    .find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, {
      color: destinationLocationColor.value,
    });
    previousColouredEnd = spaceToColor;
  }
}
endSpaceSelector.onchange = onEndSpaceChange;

// Save current fake position updates as JSON
downloadButton.onclick = () => {
  if (positions) {
    saveTemplateAsFile("positions.json", positions);
  } else {
    alert("Generate a route first");
  }
};

// Clear current fake data
resetButton.onclick = () => {
  if (mapView == null) {
    console.error("MapView not loaded!");
    return;
  }
  mapView.Navigation.clear();
  positions = undefined;
  fakePositionUpdater.reset();
  mapView.BlueDot.disable();
  blueDotEnabled = false;
};

/**
 * Helper functions
 */

// Get a number from an input element
const getNumericInputFromElementById = (
  id: string,
  fallback: number
): number => {
  return parseFloat(
    (document.getElementById(id) as HTMLInputElement)?.value ||
      fallback.toString()
  );
};

/**
 * Initialize the map content
 */
async function init(mapDataOptions: TGetMapDataOptions) {
  // Load data
  mapData = await getMapData(mapDataOptions);

  // Clear any existing map and load a new one
  const container = document.getElementById("map-container") as HTMLDivElement;
  const mapEl = document.createElement("div");
  (container as any)?.replaceChildren(mapEl);
  mapView = await show3dMap(mapEl, mapData);

  mapView.Labels.all();
  // Set each space to be interactive.
  mapData.getByType("space").forEach((space) => {
    if (space.name) {
      mapView.updateState(space, {
        interactive: true,
      });
    }
  });

  // Enable blue dot with fake position updates
  mapView.BlueDot.enable();
  blueDotEnabled = true;

  // Generate fake geolocation updates
  generateButton.onclick = () => {
    if (mapData == null) return;

    if (!blueDotEnabled) {
      mapView.BlueDot.enable();
      blueDotEnabled = true;
    }

    if (startSpaceSelector.value === endSpaceSelector.value) {
      console.error("Can't generate a path from a location to itself");
      return;
    }

    if (startSpaceSelector.value && endSpaceSelector.value) {
      // Get configured options
      const jitter = getNumericInputFromElementById("jitter", 0);
      const speed = getNumericInputFromElementById("speed", 1000);
      const accuracy = getNumericInputFromElementById("accuracy", 5);
      const updateDistance = getNumericInputFromElementById(
        "updateDistance",
        5
      );

      // Generate directions
      const start = mapData.getById("space", startSpaceSelector.value);
      const end = mapData.getById("space", endSpaceSelector.value);

      if (start && end) {
        const directions = mapData.getDirections(start, end);

        if (directions) {
          positions = generatePositionUpdates(mapData, directions, {
            maxJitter: jitter,
            accuracy,
            updateDistance: updateDistance,
          });

          if (showPathCheckbox.checked === true) {
            const pathColor = (
              document.getElementById("pathColor") as HTMLInputElement
            ).value;
            const pathRadius = Number(
              (document.getElementById("pathRadius") as HTMLInputElement).value
            );
            mapView.Navigation.draw(directions, {
              pathOptions: {
                color: pathColor,
                nearRadius: pathRadius,
              },
            });
          }
        }

        if (positions) {
          fakePositionUpdater.start(positions, speed, onFakePositionReceived);
        }
      }
    }
  };

  // Configure location selector dropdowns with venue data
  populateFloorSelector(
    document.getElementById("floorSelector")! as HTMLSelectElement,
    mapData,
    mapView
  );
  populateSpaceSelector(mapData.getByType("space"), startSpaceSelector);
  populateSpaceSelector(mapData.getByType("space"), endSpaceSelector);
  if (endSpaceSelector.options.length > 1) {
    endSpaceSelector.value = startSpaceSelector.options[1].value;
  }

  // Configure markers
  let setSpaceMarker: Marker | undefined;

  const deleteSpaceMarker = () => {
    if (setSpaceMarker) {
      mapView.Markers.remove(setSpaceMarker);
      setSpaceMarker = undefined;
    }
  };
  (window as any).deleteSpaceMarker = deleteSpaceMarker;

  mapView.on("click", async (event) => {
    deleteSpaceMarker();

    if (event.spaces[0]) {
      setSpaceMarker = mapView.Markers.add(
        event.spaces[0],
        `<div style="background: white; padding: 0.3rem;">
        <span>${event.spaces[0].name}</span><br />`
      );
    }
  });

  // Act on the floor-change event to update the level selector.
  mapView.on("floor-change", (event) => {
    // update the level selector
    const id = event?.floor.id;
    if (!id) return;
    setSelectedFloor(id);
  });

  function onFakePositionReceived(position: TBlueDotPositionUpdate) {
    mapView.BlueDot.update(position);

    // Change the current map when Blue Dot moves to a different floor.
    if (mapView.currentFloor.id != position.floorOrFloorId) {
      mapView.setFloor(position.floorOrFloorId!);
    }

    if (
      typeof position.latitude === "number" &&
      typeof position.longitude === "number"
    ) {
      const focusCoordinate = mapView.createCoordinate(
        position.latitude,
        position.longitude
      );

      mapView.Camera.animateTo(
        { center: focusCoordinate, zoomLevel: 20 },
        { duration: 1000, easing: "ease-in-out" }
      );
    }
    const blueDotPositionElement = document.getElementById(
      "bluedotupdate"
    )! as HTMLElement;
    blueDotPositionElement.textContent = JSON.stringify(position, null, 2);
  }
}

// Load initial venue
init(getMapDataOptionsWithFallbacks());

// Load a new venue
loadMapButton.onclick = () => {
  init(getMapDataOptionsWithFallbacks());
};

/*
const options = {
	key: 'mik_1YlSdV9drsYtVjmEo555607d4',
  secret: 'mis_3yPjFAkOAKGx8m80DYFPTCfYwEwgFBBEoopIUIPWity7ce0100c',
  mapId: '67dd806506b0a1000b97bae7',
}; */
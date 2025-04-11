import {
  getMapData,
  MapData,
  MapView,
  Marker,
  show3dMap,
  Space,
  TGetMapDataOptions,
  TBlueDotPositionUpdate,
  DOORS,
} from "@mappedin/mappedin-js";
import "@mappedin/mappedin-js/lib/index.css";
import { generatePositionUpdates } from "./generator";
import { populateSpaceSelector } from "./spaceSelector";
import { populateFloorSelector } from "./floorSelector";
import { setSelectedFloor } from "./floorSelector";
import { saveTemplateAsFile } from "./fileDownloader";
import { DynamicPositionUpdater } from "./positionUpdater";

const DEMO_KEY = "mik_1YlSdV9drsYtVjmEo555607d4";
const DEMO_SECRET = "mis_3yPjFAkOAKGx8m80DYFPTCfYwEwgFBBEoopIUIPWity7ce0100c";
const DEMO_MAP_ID = "67dd806506b0a1000b97bae7";

let mapData: MapData;
let mapView: MapView;
let currentInfoWindow: any = null;
let blueDotEnabled = false;
let positions: TBlueDotPositionUpdate[] | undefined;
let idSpace;

const fakePositionUpdater = new DynamicPositionUpdater();

// Elementos del DOM
const startSpaceSelector = document.getElementById("startSpace") as HTMLSelectElement;
const endSpaceSelector = document.getElementById("endSpace") as HTMLSelectElement;
const showPathCheckbox = document.getElementById("showPath") as HTMLInputElement;
const generateButton = document.getElementById("generate") as HTMLButtonElement;
const downloadButton = document.getElementById("download") as HTMLButtonElement;
const resetButton = document.getElementById("reset") as HTMLButtonElement;
const startLocationColor = document.getElementById("startLocationColor") as HTMLInputElement;
const destinationLocationColor = document.getElementById("destinationLocationColor") as HTMLInputElement;
const goToLocationButton = document.getElementById("goToLocation") as HTMLButtonElement;

const getMapDataOptionsWithFallbacks = (): TGetMapDataOptions => {
  return {
    mapId: DEMO_MAP_ID,
    key: DEMO_KEY,
    secret: DEMO_SECRET,
    environment: "us",
  };
};

let previousColouredStart: Space | undefined;
function onStartSpaceChange(event: any) {
  if (previousColouredStart) {
    mapView.updateState(previousColouredStart, { color: "initial" });
  }

  const spaceToColor = mapData.getByType("space").find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, { color: startLocationColor.value });
    previousColouredStart = spaceToColor;
  }
}

let previousColouredEnd: Space | undefined;
function onEndSpaceChange(event: any) {
  if (previousColouredEnd) {
    mapView.updateState(previousColouredEnd, { color: "initial" });
  }

  const spaceToColor = mapData.getByType("space").find((s) => s.id === event.target.value);
  if (spaceToColor) {
    mapView.updateState(spaceToColor, { color: destinationLocationColor.value });
    previousColouredEnd = spaceToColor;
  }
}

async function init(mapDataOptions: TGetMapDataOptions) {
  // Load data
  mapData = await getMapData(mapDataOptions);

  // Clear any existing map and load a new one
  const container = document.getElementById("map-container") as HTMLDivElement;
  container.innerHTML = '';
  const mapEl = document.createElement("div");
  mapEl.style.height = "100%";
  mapEl.style.width = "100%";
  container.appendChild(mapEl);

  mapView = await show3dMap(mapEl, mapData);

  // Configuración inicial del mapa
  mapView.Labels.all();

  mapData.getByType("space").forEach((space) => {
    if (space.name) {
      mapView.updateState(space, {
        interactive: true,
        hoverColor: 'lightgreen',
      });
    }
  });

  mapData.getByType("connection").forEach((connection) => {
    const coords = connection.coordinates.find(
      (coord) => coord.floorId === mapView.currentFloor.id
    );
    if (coords) {
      mapView.Labels.add(coords, connection.name);
    }
  });

  // Habilitar Blue Dot
  mapView.BlueDot.enable();
  blueDotEnabled = true;

  // Configurar eventos
  startSpaceSelector.onchange = onStartSpaceChange;
  endSpaceSelector.onchange = onEndSpaceChange;

  downloadButton.onclick = () => {
    if (positions) {
      saveTemplateAsFile("positions.json", positions);
    } else {
      alert("Generate a route first");
    }
  };

  resetButton.onclick = () => {
    if (mapView == null) return;
    mapView.Navigation.clear();
    positions = undefined;
    fakePositionUpdater.reset();
    mapView.BlueDot.disable();
    blueDotEnabled = false;
  };

  goToLocationButton.onclick = () => {
    if (mapView == null) return;

    if (!blueDotEnabled) {
      mapView.BlueDot.enable();
      blueDotEnabled = true;
    }

    const space = mapData.getById("space", idSpace.id);

    if (space) {
      mapView.Camera.animateTo({
        center: mapView.createCoordinate(space.anchorTarget?.latitude || 0, space.anchorTarget?.longitude || 0),
        zoomLevel: 21,
        bearing: 0
      }, { duration: 1000 });
    }

    const jitter = parseFloat((document.getElementById("jitter") as HTMLInputElement)?.value || "0");
    const speed = parseFloat((document.getElementById("speed") as HTMLInputElement)?.value || "1000");
    const accuracy = parseFloat((document.getElementById("accuracy") as HTMLInputElement)?.value || "5");
    const updateDistance = parseFloat((document.getElementById("updateDistance") as HTMLInputElement)?.value || "5");

    const start = mapData.getById("space", startSpaceSelector.value);
    console.log("start:", start);
    const end = mapData.getById("space", idSpace);
    console.log("end:", idSpace);

    if (start && end) {
      const directions = mapData.getDirections(start, end);

      if (directions) {
        positions = generatePositionUpdates(mapData, directions, {
          maxJitter: jitter,
          accuracy,
          updateDistance: updateDistance,
        });

        if (showPathCheckbox.checked === true) {
          const pathColor = (document.getElementById("pathColor") as HTMLInputElement).value;
          const pathRadius = Number((document.getElementById("pathRadius") as HTMLInputElement).value);
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
  };

  generateButton.onclick = () => {
    if (!mapData) return;

    if (!blueDotEnabled) {
      mapView.BlueDot.enable();
      blueDotEnabled = true;
    }

    if (startSpaceSelector.value === endSpaceSelector.value) {
      console.error("Can't generate a path from a location to itself");
      return;
    }

    if (startSpaceSelector.value && endSpaceSelector.value) {
      const jitter = parseFloat((document.getElementById("jitter") as HTMLInputElement)?.value || "0");
      const speed = parseFloat((document.getElementById("speed") as HTMLInputElement)?.value || "1000");
      const accuracy = parseFloat((document.getElementById("accuracy") as HTMLInputElement)?.value || "5");
      const updateDistance = parseFloat((document.getElementById("updateDistance") as HTMLInputElement)?.value || "5");

      const start = mapData.getById("space", startSpaceSelector.value);
      const end = mapData.getById("space", endSpaceSelector.value);
      console.log("start:", start);
      console.log("end:", end);

      if (start && end) {
        const directions = mapData.getDirections(start, end);

        if (directions) {
          positions = generatePositionUpdates(mapData, directions, {
            maxJitter: jitter,
            accuracy,
            updateDistance: updateDistance,
          });

          if (showPathCheckbox.checked === true) {
            const pathColor = (document.getElementById("pathColor") as HTMLInputElement).value;
            const pathRadius = Number((document.getElementById("pathRadius") as HTMLInputElement).value);
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

  // Configurar selectores
  populateFloorSelector(
    document.getElementById("floorSelector") as HTMLSelectElement,
    mapData,
    mapView
  );
  populateSpaceSelector(mapData.getByType("space"), startSpaceSelector);
  populateSpaceSelector(mapData.getByType("space"), endSpaceSelector);
  if (endSpaceSelector.options.length > 1) {
    endSpaceSelector.value = startSpaceSelector.options[1].value;
  }

  // Eventos del mapa
  mapView.on("click", async (event) => {
    if (currentInfoWindow) {
      currentInfoWindow.remove();
      currentInfoWindow = null;
    }

    if (event.spaces[0]) {
      const space = event.spaces[0];
      console.log("Space object:", space);

      // Obtener datos del espacio
      const name_img = space.images?.[0]?.name || "";
      const url_img = space.images?.[0]?.url || "";
      const name_links = space.links?.[0]?.name || "Más información";
      const url_links = space.links?.[0]?.url || "#";
      const name = space.name || "Sin nombre";
      const description = space.description || "Sin descripción disponible";
      const type = space.type || "";
      idSpace = space;
      console.log("idSpace:", idSpace);

      // Obtener elementos del modal
      const modalTitle = document.getElementById('spaceModalLabel')!;
      const spaceType = document.getElementById('spaceType')!;
      const spaceDescription = document.getElementById('spaceDescription')!;
      const spaceImage = document.getElementById('spaceImage') as HTMLImageElement;
      const spaceLink = document.getElementById('spaceLink') as HTMLAnchorElement;

      // Llenar el modal con los datos
      modalTitle.textContent = name;
      spaceType.textContent = type;
      spaceDescription.textContent = description;

      // Manejar la imagen (mostrar solo si existe)
      if (url_img) {
        spaceImage.src = url_img;
        spaceImage.alt = name_img || name;
        spaceImage.style.display = 'block';
      } else {
        spaceImage.style.display = 'none';
      }

      // Manejar el enlace (mostrar solo si es válido)
      if (url_links && url_links !== "#") {
        spaceLink.href = url_links;
        spaceLink.textContent = name_links;
        spaceLink.style.display = 'inline-block';
      } else {
        spaceLink.style.display = 'none';
      }
      // Mostrar el modal usando Bootstrap
      const modalElement = document.getElementById('spaceModal')!;
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();

      try {
        const coordinate = mapView.createCoordinate(
          space.anchorTarget?.latitude || 0,
          space.anchorTarget?.longitude || 0
        );

        mapView.Camera.animateTo({
          center: coordinate,
          zoomLevel: 21,
          bearing: 0
        }, { duration: 1000 });
      } catch (error) {
        console.error("Error:", error);
      }
    }
  });

  mapView.on("floor-change", (event) => {
    const id = event?.floor.id;
    if (!id) return;
    setSelectedFloor(id);
  });

  // Configuración de puertas
  mapView.updateState(DOORS.Interior, {
    visible: true,
    color: '#5C4033',
    opacity: 0.6,
  });

  mapView.updateState(DOORS.Exterior, {
    visible: true,
    color: 'black',
    opacity: 0.6,
  });

  function onFakePositionReceived(position: TBlueDotPositionUpdate) {
    mapView.BlueDot.update(position);
    console.log("BlueDot update:", position);

    if (mapView.currentFloor.id != position.floorOrFloorId) {
      mapView.setFloor(position.floorOrFloorId!);
    }

    if (typeof position.latitude === "number" && typeof position.longitude === "number") {
      const focusCoordinate = mapView.createCoordinate(
        position.latitude,
        position.longitude
      );

      mapView.Camera.animateTo(
        { center: focusCoordinate, zoomLevel: 20 },
        { duration: 1000, easing: "ease-in-out" }
      );
    }

    const blueDotPositionElement = document.getElementById("bluedotupdate") as HTMLElement;
    blueDotPositionElement.textContent = JSON.stringify(position, null, 2);
  }
}

// Inicializar el mapa
init(getMapDataOptionsWithFallbacks());
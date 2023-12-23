import { publicToken, sceneUUID } from "./config.js";
import * as THREE from "three";

// Time (s) to get to a new point with the travel function
const TIME_TO_TRAVEL = 3;

initApp();

async function initApp() {
    await startSession();
    const data = await initSceneData();
    await setupHtmlLayout(data);
    setupCanvasEvents();
}

async function startSession() {
    const sessionConnectionInfo = await SDK3DVerse.getSessionConnectionInfo({
        userToken: publicToken,
        sceneUUID: sceneUUID,
        joinExisting: true,
    });

    await SDK3DVerse.start({
        sessionConnectionInfo,
        canvas: document.getElementById("display-canvas"),
        viewportProperties: {
            defaultControllerType: SDK3DVerse.controller_type.orbit,
        },
        maxDimension: 1920,
    });
}

async function initSceneData() {
    const { initialCameraPosition, basePoint } = await setupOrbitPoint();
    const { storeysEntities, storeyRTID2index, storey2Spaces, allSpaces, spaceRTID2index } =
        await parseStoreysAndSpacesEntities();
    return {
        initialCameraPosition,
        basePoint,
        storeysEntities,
        storeyRTID2index,
        storey2Spaces,
        allSpaces,
        spaceRTID2index,
    };
}

async function setupHtmlLayout(data) {
    const {
        initialCameraPosition,
        basePoint,
        storeysEntities,
        storeyRTID2index,
        storey2Spaces,
        allSpaces,
        spaceRTID2index,
    } = data;

    const storeysUl = document.getElementsByClassName("storeys")[0];

    for (const storey of storeysEntities) {
        const storeyLi = document.createElement("li");

        storeyLi.id = storeyRTID2index[storey.rtid];

        // Visible by default
        // storeyLi.className = "active";

        const storeyHeader = document.createElement("div");
        storeyHeader.className = "summary";

        // Contains chevron and storey name
        const togglerDiv = document.createElement("div");
        togglerDiv.className = "toggle-active";
        togglerDiv.addEventListener("click", (event) => changeVisibility(event, storeysEntities));

        const chevronDiv = document.createElement("div");
        chevronDiv.className = "chevron";

        const storeyName = document.createElement("h3");
        const name = storey.components.debug_name.value.replace("(IfcBuildingStorey)", "<small>$&</small>");
        storeyName.innerHTML = name;

        const visibilityIcon = document.createElement("div");
        visibilityIcon.className = "visibility-icon";
        visibilityIcon.addEventListener("click", (event) => updateStoreyVisibility(event, storeysEntities));

        togglerDiv.appendChild(chevronDiv);
        togglerDiv.appendChild(storeyName);
        storeyHeader.appendChild(togglerDiv);
        storeyHeader.appendChild(visibilityIcon);
        storeyLi.appendChild(storeyHeader);
        storeysUl.appendChild(storeyLi);

        const spacesDiv = document.createElement("div");
        const spacesUl = document.createElement("ul");
        spacesUl.className = "spaces";

        const spacesEntity = storey2Spaces[storey.components.debug_name.value];

        if (spacesEntity) {
            const spacesEntities = await spacesEntity.getChildren();

            for (const spaceEntity of spacesEntities) {
                const spaceLi = document.createElement("li");
                spaceLi.id = spaceRTID2index[spaceEntity.rtid];
                spaceLi.addEventListener("click", (event) =>
                    toRoom(event, allSpaces, initialCameraPosition, basePoint),
                );

                const spaceName = spaceEntity.components.debug_name.value.replace("(IfcSpace)", "<small>$&</small>");
                spaceLi.innerHTML = spaceName;
                spacesUl.appendChild(spaceLi);
            }
        } else {
            const spaceLi = document.createElement("li");
            spaceLi.innerHTML = "No IfcSpace at this storey";
            spaceLi.classList = "empty-storey";
            spacesUl.appendChild(spaceLi);
        }

        spacesDiv.appendChild(spacesUl);
        storeyLi.appendChild(spacesDiv);
    }

    setupResetButton(initialCameraPosition, basePoint);
}

function setupCanvasEvents() {
    getIfcTypeOnClickOnCanvas();
}

async function setupOrbitPoint() {
    // Set the orbit point as the center of the IfcProject aabb
    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    const initialCameraPosition = new THREE.Vector3(
        cameraPose.position[0],
        cameraPose.position[1],
        cameraPose.position[2],
    );

    const projectEntity = (await SDK3DVerse.engineAPI.findEntitiesByNames("IfcProject"))[0];

    const localAABB = projectEntity.components.local_aabb;
    const localAABBCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);

    const basePoint = applyTransformation(projectEntity.getGlobalMatrix(), localAABBCenter);

    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
    });

    return { initialCameraPosition, basePoint };
}

async function parseStoreysAndSpacesEntities() {
    let storeysEntities = [];
    let storeyRTID2index = {};
    let storey2Spaces = {};
    let allSpaces = [];
    let spaceRTID2index = {};

    // Get the storeys container entity
    const storeys = (await SDK3DVerse.engineAPI.findEntitiesByNames("IfcBuildingStorey"))[0];

    const storeychildren = await storeys.getChildren();

    for (const storeyEntity of storeychildren) {
        storeysEntities.push(storeyEntity);

        storey2Spaces[storeyEntity.components.debug_name.value] = null;

        const childClassEntities = await storeyEntity.getChildren();

        for (const childClassEntity of childClassEntities) {
            if (childClassEntity.components.debug_name.value == "IfcSpace") {
                storey2Spaces[storeyEntity.components.debug_name.value] = childClassEntity;

                const spacesEntities = await childClassEntity.getChildren();

                for (const spaceEntity of spacesEntities) {
                    allSpaces.push(spaceEntity);
                    spaceRTID2index[spaceEntity.rtid] = allSpaces.length - 1;
                }
            }
        }
    }

    // Sort the storeys by alphabetical order
    storeysEntities = storeysEntities.sort((a, b) =>
        a.components.debug_name.value.localeCompare(b.components.debug_name.value),
    );

    for (let i = 0; i < storeysEntities.length; i++) {
        storeyRTID2index[storeysEntities[i].rtid] = i;
    }

    return { storeysEntities, storeyRTID2index, storey2Spaces, allSpaces, spaceRTID2index };
}

function getIfcTypeOnClickOnCanvas() {
    const canvas = document.getElementById("display-canvas");
    canvas.addEventListener("click", (event) => onClick(event));
}

const onClick = async (event) => {
    const target = await SDK3DVerse.engineAPI.castScreenSpaceRay(event.clientX, event.clientY);
    if (!target.pickedPosition) return;
    const entity = target.entity;
    // Print the IFC type
    console.log(entity.getParent().getParent().components.debug_name.value);
};

function computeDistance(u, v) {
    var dx = u.x - v.x;
    var dy = u.y - v.y;
    var dz = u.z - v.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function applyTransformation(globalMatrix, point) {
    const transformationMatrix = new THREE.Matrix4();
    transformationMatrix.fromArray(globalMatrix);

    const toBeTransformed = new THREE.Vector3(...point);
    let transformedPoint = toBeTransformed.applyMatrix4(transformationMatrix);

    return transformedPoint;
}

function changeVisibility(event, storeysEntities) {
    if (event.currentTarget.parentNode.parentNode.className == "active") {
        event.currentTarget.parentNode.parentNode.className = "";
    } else {
        event.currentTarget.parentNode.parentNode.className = "active";
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(true);
    }
}

function toRoom(event, allSpaces, initialCameraPosition, basePoint) {
    const spaceUUID = allSpaces[event.currentTarget.id].components.euid.value;
    goToRoom(spaceUUID);
}

function updateStoreyVisibility(event, storeysEntities) {
    if (event.currentTarget.parentNode.parentNode.classList.contains("hidden")) {
        event.currentTarget.parentNode.parentNode.classList.remove("hidden");
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(true);
    } else {
        event.currentTarget.parentNode.parentNode.classList.add("hidden");
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(false);
    }
}

function resetInitialView(initialCameraPosition, basePoint) {
    const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    const fromPosition = cameraPose.position;

    const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
    const distance = computeDistance(departurePosition, initialCameraPosition);

    const speed = distance / TIME_TO_TRAVEL;

    SDK3DVerse.engineAPI.cameraAPI.travel(
        activeViewPort,
        [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z],
        [0, 0, 0, 1],
        speed,
    );
    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
    });
}

function setupResetButton(initialCameraPosition, basePoint) {
    const button = document.getElementsByClassName("reset-button")[0];
    button.addEventListener("click", () => resetInitialView(initialCameraPosition, basePoint));
    return button;
}

function getBoundingBoxCenter(min, max) {
    const center = [];

    for (let i = 0; i < 3; i++) {
        center[i] = (min[i] + max[i]) / 2;
    }

    return center;
}

async function goToRoom(roomUUID) {
    const spaceEntity = (await SDK3DVerse.engineAPI.findEntitiesByEUID(roomUUID))[0];

    const localAABB = spaceEntity.components.local_aabb;
    const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    const fromPosition = cameraPose.position;

    const aabbCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);

    const aabbCenterGlobal = applyTransformation(spaceEntity.getGlobalMatrix(), aabbCenter);

    const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
    const distance = computeDistance(departurePosition, aabbCenterGlobal);

    const speed = distance / TIME_TO_TRAVEL;

    SDK3DVerse.engineAPI.cameraAPI.travel(
        activeViewPort,
        [aabbCenterGlobal.x + 0.5, aabbCenterGlobal.y + 0.5, aabbCenterGlobal.z + 0.5],
        [0, 0, 0, 1],
        speed,
    );

    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [aabbCenterGlobal.x, aabbCenterGlobal.y, aabbCenterGlobal.z],
    });
}

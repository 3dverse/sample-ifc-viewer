import { publicToken, sceneUUID } from "./config.js";
import * as THREE from "three";

// Time (s) to get to a new point with the travel function.
const TIME_TO_TRAVEL = 3;

window.addEventListener("load", InitApp);

async function InitApp() {
    // Start a 3dverse session to access assets and use the SDK.
    await startSession();
    // Setup the orbit target and parse IFC data from the scene graph.
    const data = await initSceneData();
    // Build the HTML elements with the parsed IFC data.
    // Each IfcBuildingStorey entity produces a toggleable element with
    // the IfcSpace entities belonging to it.
    await setupHtmlLayout(data);
    // Setup events related to the canvas. In this sample dedicated to
    // IFC, a click on an 3dverse entity visible in the canvas will display
    // its IFC entity type in the console.
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
    // Setup the orbit target such that the camera moves looking at the center
    // of the IfcProjet entity AABB.
    const { initialCameraPosition, basePoint } = await setupOrbitPoint();
    // Parse the IFC data to get access to The IfcBuildingStorey entities, the
    // IfcSpace entities, and relate the IfcSpace entities to the IfcBuildingStorey
    // entities.
    const { storeysEntities, storeyRTID2index, storey2Spaces, allSpaces, spaceRTID2index, storeysVisibility } =
        await parseStoreysAndSpacesEntities();
    return {
        initialCameraPosition,
        basePoint,
        storeysEntities,
        storeyRTID2index,
        storey2Spaces,
        allSpaces,
        spaceRTID2index,
        storeysVisibility,
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
        storeysVisibility,
    } = data;

    // Get the HTML element which contains the storeys.
    const storeysUl = document.getElementsByClassName("storeys")[0];
    // Iterate over the IfcBuildingStorey entities.
    for (const storey of storeysEntities) {
        const storeyLi = document.createElement("li");
        // Access the index of the storey entity in the flat array container.
        // Set the id of the element representing that storey as a mean to get
        // it back when an event function requires access to it.
        storeyLi.id = storeyRTID2index[storey.rtid];

        const storeyHeader = document.createElement("div");
        storeyHeader.className = "summary";

        const togglerDiv = document.createElement("div");
        togglerDiv.className = "toggle-active";
        togglerDiv.addEventListener("click", (event) => changeVisibility(event, storeysEntities));

        const chevronDiv = document.createElement("div");
        chevronDiv.className = "chevron";

        const storeyName = document.createElement("h3");
        // Here we visually differentiate the IfcBuildingStorey entity name from
        // its IFC entity type.
        const name = storey.components.debug_name.value.replace("(IfcBuildingStorey)", "<small>$&</small>");
        storeyName.innerHTML = name;
        // This visibility icon will either (depending on its current state)
        // show or display the entire set of entities belonging to the IfcBuildingStorey
        // entity.
        const visibilityIcon = document.createElement("div");
        visibilityIcon.className = "visibility-icon";
        visibilityIcon.addEventListener("click", (event) =>
            updateStoreyVisibility(event, storeysEntities, storeysVisibility),
        );

        const isolationIcon = document.createElement("div");
        isolationIcon.className = "isolation-icon";
        isolationIcon.addEventListener("click", (event) => isolateStorey(event, storeysEntities, storeysVisibility));

        togglerDiv.appendChild(chevronDiv);
        togglerDiv.appendChild(storeyName);
        storeyHeader.appendChild(togglerDiv);
        storeyHeader.appendChild(visibilityIcon);
        storeyHeader.appendChild(isolationIcon);
        storeyLi.appendChild(storeyHeader);
        storeysUl.appendChild(storeyLi);
        // The following HTML elements enable to display the IfcSpace entities belonging to
        // the IfcBuildingStorey entity.
        const spacesDiv = document.createElement("div");
        const spacesUl = document.createElement("ul");
        spacesUl.className = "spaces";
        // Retrieve the IfcSpace entities belonging to the IfcBuildingStorey entities.
        const spacesEntity = storey2Spaces[storey.components.debug_name.value];
        // Some IfcBuildingStorey do not contain any IfcSpace entity.
        if (spacesEntity) {
            const spacesEntities = await spacesEntity.getChildren();
            // Create an HTML element for each IfcSpace entity.
            for (const spaceEntity of spacesEntities) {
                const spaceLi = document.createElement("li");
                // Same as for the IfcBuildingStorey entities, we store the index of the
                // IfcSpace entity in the flat array for later access.
                spaceLi.id = spaceRTID2index[spaceEntity.rtid];
                // When the clicking event on a space HTML element is triggered we call a
                // function to travel to the center of its aabb.
                spaceLi.addEventListener("click", (event) =>
                    toRoom(event, allSpaces, initialCameraPosition, basePoint),
                );
                // Here we visually differentiate the IfcSpace entity name from its IFC
                // entity type.
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
    // Creation of a reset button which will travel back to the original
    // position and orbit target computed in setupOrbitPoint when being clicked on.
    setupResetButton(initialCameraPosition, basePoint);
}

function setupCanvasEvents() {
    // Only one call to a function which sets the IFC entity type display
    // on a can canvas click, but many other canvas events
    // can be added.
    getIfcTypeOnClickOnCanvas();
}

async function setupOrbitPoint() {
    // Set the orbit point as the center of the IfcProject entity aabb.
    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    const initialCameraPosition = new THREE.Vector3(
        cameraPose.position[0],
        cameraPose.position[1],
        cameraPose.position[2],
    );
    // Get the IFC project entity which is the common ancestor of all the
    // IFC entities in the scene graph in accordance with the IFC spatial
    // structure specification.
    const projectEntity = (await SDK3DVerse.engineAPI.findEntitiesByNames("IfcProject"))[0];

    const localAABB = projectEntity.components.local_aabb;
    // Compute the aabb center of the IfcProject entities from its local
    // boundaries.
    const localAABBCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);
    // Get the global coordinates of the aabb center by applying the
    // IfcProject entity global matrix.
    const basePoint = applyTransformation(projectEntity.getGlobalMatrix(), localAABBCenter);
    // Set the orbit target to the aabb center expressed in global coordinates.
    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
    });

    return { initialCameraPosition, basePoint };
}

async function parseStoreysAndSpacesEntities() {
    // This flat array serves as a container of IfcBuildingStoreys instances which
    // were converted as 3dverse entities.
    let storeysEntities = [];
    // This object enables to access the position of an IfcBuildingElement in the
    // storeysEntities array from its RTID.
    let storeyRTID2index = {};
    // This object allows to access IfcSpace entities from the name of the IfcBuildingStorey
    // they are part of.
    let storey2Spaces = {};
    // This flat array serves as a container of IfcSpace instances which were converted as
    // 3dverse entities.
    let allSpaces = [];
    // This object has the same purpose as storeyRTID2index but for IfcSpace entities.
    let spaceRTID2index = {};

    let storeysVisibility = [];

    // Get the IfcBuildingStorey container entity. As from the layout of the scene graph
    // built in the IFC conversion, this entity contains all the IfcBuildingStorey instances.
    const storeys = (await SDK3DVerse.engineAPI.findEntitiesByNames("IfcBuildingStorey"))[0];

    const storeychildren = await storeys.getChildren();
    // Iterate over the IfcBuildingStorey instances.
    for (const storeyEntity of storeychildren) {
        storeysEntities.push(storeyEntity);
        // Set null by default in case the IfcBuildingStorey entity does not contain any
        // IfcSpace entity.
        storey2Spaces[storeyEntity.components.debug_name.value] = null;
        // Get the entities contained within the IfcBuildingStorey entity.
        // In the way the scene graph is built, those entities are themselves IFC types
        // containers in which we'll be specifically looking for IfcSpace entities.
        const childClassEntities = await storeyEntity.getChildren();
        // Iterate over the IFC type containers to get the IfcSpace one.
        for (const childClassEntity of childClassEntities) {
            if (childClassEntity.components.debug_name.value == "IfcSpace") {
                // Save relation between storey and space.
                storey2Spaces[storeyEntity.components.debug_name.value] = childClassEntity;
                // Get the IfcSpace instances contained in the IfcSpace container entity.
                const spacesEntities = await childClassEntity.getChildren();
                // Store the IfcSpace instances the decicated array, and populate
                // spaceRTID2index object.
                for (const spaceEntity of spacesEntities) {
                    allSpaces.push(spaceEntity);
                    spaceRTID2index[spaceEntity.rtid] = allSpaces.length - 1;
                }
            }
        }
    }

    // Sort the storeys by alphabetical order.
    storeysEntities = storeysEntities.sort((a, b) =>
        a.components.debug_name.value.localeCompare(b.components.debug_name.value),
    );
    // Populate the storeyRTID2index object.
    for (let i = 0; i < storeysEntities.length; i++) {
        storeyRTID2index[storeysEntities[i].rtid] = i;
        storeysVisibility[i] = true;
    }

    return { storeysEntities, storeyRTID2index, storey2Spaces, allSpaces, spaceRTID2index, storeysVisibility };
}

function getIfcTypeOnClickOnCanvas() {
    const canvas = document.getElementById("display-canvas");
    canvas.addEventListener("click", (event) => displayIfcType(event));
}

const displayIfcType = async (event) => {
    const target = await SDK3DVerse.engineAPI.castScreenSpaceRay(event.clientX, event.clientY);
    if (!target.pickedPosition) return;
    const entity = target.entity;
    // Print the IFC type. This visits the clicked element grandparent as
    // the mesh being clicked on is contained within an IFC instance entity which
    // is itself contained in an IFC type entity.
    console.log(entity.getParent().getParent().components.debug_name.value);
};

// Compute the distance between two 3D points.
function computeDistance(u, v) {
    var dx = u.x - v.x;
    var dy = u.y - v.y;
    var dz = u.z - v.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function applyTransformation(globalMatrix, point) {
    // Initialize an empty three.js 4x4 matrix for later application on a 3D point.
    const transformationMatrix = new THREE.Matrix4();
    // Populate the matrix.
    transformationMatrix.fromArray(globalMatrix);

    const toBeTransformed = new THREE.Vector3(...point);
    // Apply the transformation to the 3D point.
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
    // Get the space being clicked on thanks to the position in allSpaces stored
    // in the HTML element id.
    const spaceUUID = allSpaces[event.currentTarget.id].components.euid.value;
    goToRoom(spaceUUID);
}

function updateStoreyVisibility(event, storeysEntities, storeysVisibility) {
    // Show or hide the entities part of the storey depending on its current state.
    if (event.currentTarget.parentNode.parentNode.classList.contains("hidden")) {
        // Show entities belonging to the IfcBuildingStorey entity.
        event.currentTarget.parentNode.parentNode.classList.remove("hidden");
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(true);
        storeysVisibility[event.currentTarget.parentNode.parentNode.id] = true;
    } else {
        // Hide entities belonging to the IfcBuildingStorey entity.
        event.currentTarget.parentNode.parentNode.classList.add("hidden");
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(false);
        storeysVisibility[event.currentTarget.parentNode.parentNode.id] = false;
    }
}

function updateVisibility() {
    for (let i = 0; i < storeysVisibility.length; i++) {
        if (storeysVisibility[i]) {
            storeysEntities[i].setVisibility(true);
        } else {
            storeysEntities[i].setVisibility(false);
        }
    }
}

function isolateStorey(event, storeysEntities, storeysVisibility) {
    const isIsolated = event.currentTarget.parentNode.parentNode.classList.contains("isolated");
    if (isIsolated) {
        // Un-isolate
        event.currentTarget.parentNode.parentNode.classList.remove("isolated");
        for (let i = 0; i < storeysEntities.length; i++) {
            storeysEntities[i].setVisibility(storeysVisibility[i]);
        }

        updateVisibility();
    } else {
        const isolatedElements = document.getElementsByClassName("isolated");
        //Only one storey can be isolated
        for (let i = 0; i < isolatedElements.length; i++) {
            isolatedElements[i].classList.remove("isolated");
        }

        event.currentTarget.parentNode.parentNode.classList.add("isolated");
        for (let i = 0; i < storeysEntities.length; i++) {
            if (parseInt(event.currentTarget.parentNode.parentNode.id) == i) {
                storeysEntities[i].setVisibility(true);
            } else {
                storeysEntities[i].setVisibility(false);
            }
        }
    }
}

function resetInitialView(initialCameraPosition, basePoint) {
    const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    // Get the current camera global position.
    const fromPosition = cameraPose.position;
    // Compute the distance between the starting and the arrival point to adjust
    // the travel speed.
    const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
    const distance = computeDistance(departurePosition, initialCameraPosition);
    // Compute the travel speed.
    const speed = distance / TIME_TO_TRAVEL;
    // Execute the travel.
    SDK3DVerse.engineAPI.cameraAPI.travel(
        activeViewPort,
        [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z],
        [0, 0, 0, 1],
        speed,
    );
    // Update the orbit target.
    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
    });
}

function setupResetButton(initialCameraPosition, basePoint) {
    const button = document.getElementsByClassName("reset-button")[0];
    // This button allows to travel back to the initial camera position and orbit
    // target when clicked on. It is useful because the goToRoom function will move
    // the camera position and orbit target to the center of the room.
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
    // Retrieve the IfcSpace entity to travel to from the scene graph.
    const spaceEntity = (await SDK3DVerse.engineAPI.findEntitiesByEUID(roomUUID))[0];

    const localAABB = spaceEntity.components.local_aabb;
    const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    // Get the current camera global position.
    const fromPosition = cameraPose.position;

    const aabbCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);
    // Convert the local aabb center to global coordinates.
    const aabbCenterGlobal = applyTransformation(spaceEntity.getGlobalMatrix(), aabbCenter);
    // Compute the distance between the starting and the arrival point to adjust
    // the travel speed.
    const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
    const distance = computeDistance(departurePosition, aabbCenterGlobal);
    // Compute the travel speed.
    const speed = distance / TIME_TO_TRAVEL;
    // Execute the travel.
    SDK3DVerse.engineAPI.cameraAPI.travel(
        activeViewPort,
        [aabbCenterGlobal.x + 0.5, aabbCenterGlobal.y + 0.5, aabbCenterGlobal.z + 0.5],
        [0, 0, 0, 1],
        speed,
    );
    // Update the orbit target.
    SDK3DVerse.updateControllerSetting({
        lookAtPoint: [aabbCenterGlobal.x, aabbCenterGlobal.y, aabbCenterGlobal.z],
    });
}

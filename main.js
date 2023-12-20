import { publicToken, sceneUUID } from './config.js';
import * as THREE from 'three';

// Time (s) to get to a new point with the travel function
const TIME_TO_TRAVEL = 3;

// For further access to IFC entities
let storeysEntities = [];
let storeyRTID2index = {};
let storey2Spaces = {};
let allSpaces = [];
let spaceRTID2index = {};

// Base point setup
let initialCameraPosition;
let basePoint;

await startSession();
await setupViewer();
setupClickableElement();


async function setupViewer() {
    // Set the orbit point as the center of the IfcProject aabb
    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    initialCameraPosition = applyTransformation(cameraPose.position, cameraPose.orientation, [0, 0, 0]);

    const projectEntity = (await SDK3DVerse.engineAPI.findEntitiesByNames("IfcProject"))[0];

    const localAABB = projectEntity.components.local_aabb;

    const globalTransform = projectEntity.getGlobalTransform();

    const localAABBCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);

    basePoint = applyTransformation(globalTransform.position, globalTransform.orientation, localAABBCenter);

    SDK3DVerse.updateControllerSetting(
        {
            lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
        });

    setupResetButton();

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

                const spacesEntities = (await childClassEntity.getChildren());

                for (const spaceEntity of spacesEntities) {
                    allSpaces.push(spaceEntity);
                    spaceRTID2index[spaceEntity.rtid] = allSpaces.length - 1;
                }
            }
        }
    }

    // Sort the storeys by alphabetical order
    storeysEntities = storeysEntities.sort((a, b) => a.components.debug_name.value.localeCompare(b.components.debug_name.value));

    for (let i = 0; i < storeysEntities.length; i++) {
        storeyRTID2index[storeysEntities[i].rtid] = i;
    }

    const storeysUl = document.getElementsByClassName("storeys")[0];

    for (const storey of storeysEntities) {

        const storeyLi = document.createElement('li');

        storeyLi.id = storeyRTID2index[storey.rtid];

        // Visible by default
        // storeyLi.className = "active";

        const storeyHeader = document.createElement('header');

        //Contains chevron and storey name
        const togglerDiv = document.createElement('div');
        togglerDiv.className = "toggle-active";
        togglerDiv.addEventListener('click', (event) => changeVisibility(event));

        const chevronDiv = document.createElement('div');
        chevronDiv.className = "chevron";

        const storeyName = document.createElement('h3');
        storeyName.innerHTML = storey.components.debug_name.value;

        const visibilityIcon = document.createElement('div');
        visibilityIcon.className = "visibility-icon";
        visibilityIcon.addEventListener('click', (event) => updateStoreyVisibility(event));

        togglerDiv.appendChild(chevronDiv);
        togglerDiv.appendChild(storeyName);
        storeyHeader.appendChild(togglerDiv);
        storeyHeader.appendChild(visibilityIcon);
        storeyLi.appendChild(storeyHeader);
        storeysUl.appendChild(storeyLi);

        const spacesDiv = document.createElement('div');
        const spacesUl = document.createElement('ul');
        spacesUl.className = "spaces";

        const spacesEntity = storey2Spaces[storey.components.debug_name.value];

        if (spacesEntity) {
            const spacesEntities = await spacesEntity.getChildren();

            for (const spaceEntity of spacesEntities) {
                const spaceLi = document.createElement('li');
                spaceLi.id = spaceRTID2index[spaceEntity.rtid];
                spaceLi.addEventListener('click', (event) => toRoom(event));

                spaceLi.innerHTML = spaceEntity.components.debug_name.value;
                spacesUl.appendChild(spaceLi);
            }
        } else {

            const spaceLi = document.createElement('li');
            spaceLi.innerHTML = "No IfcSpace at this storey";
            spacesUl.appendChild(spaceLi);
        }

        spacesDiv.appendChild(spacesUl);
        storeyLi.appendChild(spacesDiv);
    }
}


function setupClickableElement() {
    const canvas = document.getElementById("display-canvas");
    canvas.addEventListener('click', (event) => onClick(event));
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

const onClick = async (event) => {
    const target = await SDK3DVerse.engineAPI.castScreenSpaceRay(event.clientX, event.clientY);
    if (!target.pickedPosition) return;
    const entity = target.entity;
    // Print the IFC type
    console.log(entity.getParent().getParent().components.debug_name.value);
}

function computeDistance(u, v) {
    var dx = u.x - v.x;
    var dy = u.y - v.y;
    var dz = u.z - v.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


function applyTransformation(position, orientation, point) {
    const transformationMatrix = new THREE.Matrix4();
    const finalTransformationMatrix = transformationMatrix.compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().fromArray(orientation),
        new THREE.Vector3(1, 1, 1)
    );

    const toBeTransformed = new THREE.Vector3(...point);
    let transformedPoint = toBeTransformed.applyMatrix4(finalTransformationMatrix);

    return transformedPoint;

}

function changeVisibility(event) {
    if (event.currentTarget.parentNode.parentNode.className == "active") {
        event.currentTarget.parentNode.parentNode.className = "";
    }
    else {
        event.currentTarget.parentNode.parentNode.className = "active";
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(true);
    }
}

function toRoom(event) {
    const spaceUUID = allSpaces[event.currentTarget.id].components.euid.value;
    goToRoom(spaceUUID);

}

function updateStoreyVisibility(event) {
    if (event.currentTarget.parentNode.parentNode.className == "hidden") {
        event.currentTarget.parentNode.parentNode.className = "";
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(true);
    } else {
        event.currentTarget.parentNode.parentNode.className = "hidden";
        storeysEntities[event.currentTarget.parentNode.parentNode.id].setVisibility(false);
    }

}

function setupResetButton() {
    const button = document.getElementsByClassName("reset-button")[0];

    button.addEventListener('click', () => {

        const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

        const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
        const fromPosition = cameraPose.position;
        const fromOrientation = cameraPose.orientation;

        const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
        const distance = computeDistance(departurePosition, initialCameraPosition);

        const speed = distance / (TIME_TO_TRAVEL);

        SDK3DVerse.engineAPI.cameraAPI.travel(
            activeViewPort,
            [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z],
            [0, 0, 0, 1],
            speed
        )
        SDK3DVerse.updateControllerSetting(
            {
                lookAtPoint: [basePoint.x, basePoint.y, basePoint.z]
            });
    });

    return button;
}

function getBoundingBoxCenter(min, max) {
    const center = [];

    for (let i = 0; i < min.length; i++) {
        center[i] = (min[i] + max[i]) / 2;
    }

    return center;
}

async function goToRoom(roomUUID) {
    const spaceEntity = (await SDK3DVerse.engineAPI.findEntitiesByEUID(roomUUID))[0];

    const globalTransform = spaceEntity.getGlobalTransform();
    const localAABB = spaceEntity.components.local_aabb;
    const activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    const cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    const fromPosition = cameraPose.position;
    const fromOrientation = cameraPose.orientation;

    const aabbCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);
    const aabbCenterGlobal = applyTransformation(globalTransform.position, globalTransform.orientation, aabbCenter);

    const departurePosition = new THREE.Vector3(fromPosition[0], fromPosition[1], fromPosition[2]);
    const distance = computeDistance(departurePosition, aabbCenterGlobal);

    const speed = distance / (TIME_TO_TRAVEL);

    SDK3DVerse.engineAPI.cameraAPI.travel(
        activeViewPort,
        [aabbCenterGlobal.x + 0.5, aabbCenterGlobal.y + 0.5, aabbCenterGlobal.z + 0.5],
        [0, 0, 0, 1],
        speed
    )

    SDK3DVerse.updateControllerSetting(
        {
            lookAtPoint: [aabbCenterGlobal.x, aabbCenterGlobal.y, aabbCenterGlobal.z]
        });
}
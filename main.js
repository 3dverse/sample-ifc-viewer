import { publicToken, sceneUUID } from './config.js';
import * as THREE from 'three';


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


const onClick = async (event) => {
    const target = await SDK3DVerse.engineAPI.castScreenSpaceRay(event.clientX, event.clientY);
    if (!target.pickedPosition) return;
    const entity = target.entity;
    // Print the IFC type
    console.log(entity.getParent().getParent().components.debug_name.value)
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

let canvas = document.getElementById("display-canvas");

canvas.addEventListener('click', (event) => onClick(event));

//Set the orbit point as the center of the aabb 

let cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
const initialCameraPosition = applyTransformation(cameraPose.position, cameraPose.orientation, [0, 0, 0]);

let projectEntity = await SDK3DVerse.engineAPI.findEntitiesByNames("IfcProject");
projectEntity = projectEntity[0];
const localAABB = projectEntity.components.local_aabb;

let globalTransform = projectEntity.getGlobalTransform();

let localAABBCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);

const basePoint = applyTransformation(globalTransform.position, globalTransform.orientation, localAABBCenter);

SDK3DVerse.updateControllerSetting(
    {
        lookAtPoint: [basePoint.x, basePoint.y, basePoint.z],
    });


// Get the storeys container entity
let storeys = await SDK3DVerse.engineAPI.findEntitiesByNames("IfcBuildingStorey");
storeys = storeys[0];

let storeysEntities = [];
let storey2Spaces = {};

const storeychildren = await storeys.getChildren();

for (let i = 0; i < storeychildren.length; i++) {
    let storeyEntity = SDK3DVerse.engineAPI.getEntity(storeys.children[i])

    storeysEntities.push(storeyEntity);
    storey2Spaces[storeyEntity.components.debug_name.value] = null;

    const childClassEntities = await storeyEntity.getChildren();

    for (let j = 0; j < childClassEntities.length; j++) {
        let childClassEntity = SDK3DVerse.engineAPI.getEntity(storeyEntity.children[j]);

        if (childClassEntity.components.debug_name.value == "IfcSpace") {
            storey2Spaces[storeyEntity.components.debug_name.value] = childClassEntity;
        }

    }
}

// Sort the storeys by alphabetical order
storeysEntities = storeysEntities.sort((a, b) => a.components.debug_name.value.localeCompare(b.components.debug_name.value));

const tableData = storeysEntities.map((element, index) => ({
    id: `${index}`, // Set a unique row ID
    storey: element.components.debug_name.value,
    visible: true,
    isolate: false,
}));

// Create and append the table to the body
function createTable(data) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Create table headers
    const headers = ['Storey', 'Visible', 'Isolate'];
    const headerRow = document.createElement('tr');

    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.appendChild(document.createTextNode(headerText));
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table rows and cells
    data.forEach(rowData => {
        const row = document.createElement('tr');

        // Set the row ID
        row.id = rowData.id;

        // Create Storey cell
        const storeyCell = document.createElement('td');
        storeyCell.appendChild(document.createTextNode(rowData.storey));
        row.appendChild(storeyCell);

        // Create Visible cell with checkbox
        const visibleCell = document.createElement('td');
        const visibleCheckbox = document.createElement('input');
        visibleCheckbox.type = 'checkbox';
        visibleCheckbox.checked = rowData.visible; // Check the 'Visible' checkbox
        visibleCheckbox.addEventListener('change', () => updateVisibility(row.id, visibleCheckbox.checked));
        visibleCell.appendChild(visibleCheckbox);
        row.appendChild(visibleCell);

        // Create Isolate cell with checkbox
        const isolateCell = document.createElement('td');
        const isolateCheckbox = document.createElement('input');
        isolateCheckbox.type = 'checkbox';
        isolateCheckbox.checked = rowData.isolate; // Uncheck the 'Isolate' checkbox
        isolateCheckbox.addEventListener('change', () => isolate(row.id, isolateCheckbox.checked));
        isolateCell.appendChild(isolateCheckbox);
        row.appendChild(isolateCell);

        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    table.id = "left-pane";

    // Append the table to the body
    const canvasContainer = document.querySelector('.canvas-container');
    canvasContainer.appendChild(table);
}

// Handle changes in the 'Visible' checkbox
function updateVisibility(rowId, isChecked) {
    if (isChecked) {
        storeysEntities[rowId].setVisibility(true);
    } else {
        storeysEntities[rowId].setVisibility(false);
    }
}

function isolate(rowId, isChecked) {
    // Get the row with the specified ID
    const row = document.getElementById(rowId);

    if (row) {
        // Get the cells of the row
        const cells = row.cells;

        // Check/uncheck the "Visible" checkbox in the row if "Isolate" is checked
        if (cells.length > 1 && isChecked) {
            cells[1].querySelector('input[type="checkbox"]').checked = true;

            storeysEntities[rowId].setVisibility(true);
        }

        // If "Isolate" is unchecked, do not affect the "Visible" checkbox in the same row
        if (isChecked) {
            // Uncheck the "Visible" checkbox in all other rows
            const allRows = document.querySelectorAll('#left-pane tbody tr');
            allRows.forEach(otherRow => {
                if (otherRow !== row) {
                    const otherCells = otherRow.cells;
                    if (otherCells.length > 1) {
                        otherCells[1].querySelector('input[type="checkbox"]').checked = false;
                        otherCells[2].querySelector('input[type="checkbox"]').checked = false;
                        storeysEntities[otherRow.id].setVisibility(false);

                    }
                }
            });
        }
    }
}

// Create the left pane (table of storeys)
createTable(tableData);

// Create the right pane (spaces filter)
const rightPane = document.createElement('div');
rightPane.id = 'right-pane';

// Create Select Inputs
const listofnames = [];

for (let i = 0; i < storeysEntities.length; i++) {
    listofnames.push(storeysEntities[i].components.debug_name.value);
}

const storeysInput = createSelectInputSpacesStoreys(listofnames);

let spacesNames = [];
let spaces = await storey2Spaces[listofnames[0]].getChildren();


for (let i = 0; i < spaces.length; i++) {
    spacesNames.push(spaces[i].components.debug_name.value);
}

const spacesInput = createSelectInputSpaces(spacesNames);

// Create Buttons
const resetButton = createResetButton('Reset');
const goToRoomButton = createGoToRoomButton('Go to Room');

// Append elements to the right pane
rightPane.appendChild(resetButton);
rightPane.appendChild(goToRoomButton);

rightPane.appendChild(storeysInput);
rightPane.appendChild(spacesInput);

const canvasContainer = document.querySelector('.canvas-container');
canvasContainer.appendChild(rightPane);

async function updateSpaces() {
    const selectElement = document.getElementById("inputStoreys")
    const selectedOption = selectElement.options[selectElement.selectedIndex];

    const selectSpaces = document.getElementById("inputSpaces");

    // Get the value of the selected option
    const selectedValue = selectedOption.value;


    let spacesNames = [];
    let spaces = await storey2Spaces[selectedValue].getChildren();


    for (let i = 0; i < spaces.length; i++) {
        spacesNames.push(spaces[i].components.debug_name.value);
    }

    selectSpaces.innerHTML = '';

    // Add new options
    spacesNames.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData;
        option.text = optionData;
        selectSpaces.add(option);
    });

}

// Create a select input for the storeys
function createSelectInputSpacesStoreys(options) {
    const select = document.createElement('select');
    select.id = "inputStoreys";

    select.addEventListener('change', () => updateSpaces());

    options.forEach(optionText => {
        const option = document.createElement('option');
        option.text = optionText;
        select.add(option);
    });
    return select;
}

// Create a select input for the spaces
function createSelectInputSpaces(options) {
    const select = document.createElement('select');
    select.id = "inputSpaces";
    options.forEach(optionText => {
        const option = document.createElement('option');
        option.text = optionText;
        select.add(option);
    });
    return select;
}

function createGoToRoomButton(text) {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', () => roomButtonClick());
    return button;
}

function createResetButton(text) {
    const button = document.createElement('button');
    button.textContent = text;

    button.addEventListener('click', () => {

        let activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

        let cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
        let fromPosition = cameraPose.position;
        let fromOrientation = cameraPose.orientation;

        SDK3DVerse.engineAPI.cameraAPI.travel(
            activeViewPort,
            [initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z],
            [0, 0, 0, 1],
            5
        )
        SDK3DVerse.updateControllerSetting(
            {
                lookAtPoint: [basePoint.x, basePoint.y, basePoint.z]
            });
    });

    return button;
}


async function roomButtonClick() {
    const selectElement = document.getElementById("inputSpaces");
    const selectedOption = selectElement.options[selectElement.selectedIndex];

    let spaceEntity = await SDK3DVerse.engineAPI.findEntitiesByNames(selectedOption.value);
    spaceEntity = spaceEntity[0];
    let uuid = spaceEntity.components.euid.value;
    goToRoom(uuid);
}


function getBoundingBoxCenter(min, max) {
    const center = [];

    for (let i = 0; i < min.length; i++) {
        center[i] = (min[i] + max[i]) / 2;
    }

    return center;
}


async function goToRoom(roomUUID) {

    let spaceEntity = await SDK3DVerse.engineAPI.findEntitiesByEUID(roomUUID);
    spaceEntity = spaceEntity[0];

    let globalTransform = spaceEntity.getGlobalTransform();
    let localAABB = spaceEntity.components.local_aabb;
    let activeViewPort = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

    let cameraPose = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getCamera().getGlobalTransform();
    let fromPosition = cameraPose.position;
    let fromOrientation = cameraPose.orientation;

    let speed = 5;

    let aabbCenter = getBoundingBoxCenter(localAABB["min"], localAABB["max"]);
    let aabbCenterGlobal = applyTransformation(globalTransform.position, globalTransform.orientation, aabbCenter);

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
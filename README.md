# IFC viewer

![IFC viewer](https://github.com/3dverse/sample-ifc-viewer/blob/main/screenshot.png?raw=true)

## Try it out

[Try it out](https://3dverse.github.io/sample-ifc-viewer/)

## Description

Simple IFC viewer with visibility control on IfcBuildingStorey entities. A click on an IfcSpace entity belonging to an IfcBuildingStorey in the side-panel allows to travel the camera into this IfcSpace to get a 360 view.

### Controls

|             | Mouse/Keyboard |
| ----------- | -------------- |
| Move around | WASD           |
| Look around | RMB            |

# How does it work?

Every client that runs this application will either start a new session of the scene or join an ongoing session if there is one running already.

## Assets inside

/Public

- Main Scene: `scene` containing the IFC instances converted to 3dverse entities as Entities with their referenced submesh(es) and material(s).

/Asset:

- Contains the IFC Mesh and all IFC Materials.

## Run it locally

Replace the following values in [config.js](https://github.com/3dverse/sample-ifc-viewer/blob/main/config.js):

- '%YOUR_PUBLIC_TOKEN%' by the public token of your application found in the "API Access" section.
- '%YOUR_MAIN_SCENE_UUID%' by the UUID of the main scene generated in the Public folder of the "Asset browser" section.

The application is a static frontend that can be served by any web server of your convenience.

### Node

You can use the [serve](https://www.npmjs.com/package/serve) package:

```
npx serve
```

### Python

You can use the [http.serve](https://docs.python.org/3/library/http.server.html) command:

```
python -m http.server
```

Now open your web browser at the url indicated by your server (http://localhost:XXXX) to run your application.
# CS405 Project 1 – Painting in 3D

I created a WebGPU application using JavaScript for this project. I worked with 3D transformations, scene graphs, camera projections and curves, and combined them in a scene based on Şeker Ahmed Paşa's *Ormanda Karaca* painting.

I used the painting as a background and created a simple 3D forest with trees and a deer in front of it. I also traced the deer's contour using Bézier curves.

## Requirements

- Node.js and npm
- A browser that supports WebGPU

## How to Run

Open the project folder in VS Code and run these commands in the terminal:

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal, usually `http://localhost:5173/`.

To check the production build, run:

```bash
npm run build
```

On Windows PowerShell, I used `npm.cmd` instead of `npm` when script execution was blocked.

## Scene Modes

I added three scene modes that can be selected from the sidebar.

**Painting Scene – Ormanda Karaca:** This is the main scene where I placed low-poly trees and a deer in front of the painting.

**Transformations and Hierarchy:** I used this mode to demonstrate transformations with cubes and parent-child relationships between objects.

**Painting and Contour:** This mode shows the painting and the curve I traced over the deer. The control points can be adjusted.

## Project Parts

### Part A – Transformations

I implemented translation, rotation and scaling using 4×4 matrices. The sliders let me change the position, rotation and scale of the cubes. I also added an option to compare TRS and SRT transformation orders and displayed their matrices in the sidebar.

### Part B – Scene Graph

I created a `SceneNode` class to handle parent-child relationships. Each node has its own local transformation and its world transformation depends on its parent. I also added an option to display the coordinate axes.

### Part C – Camera and Projection

I implemented perspective and orthographic projections. The camera can be controlled using the sliders or by dragging the mouse and scrolling to zoom. I also added an inspection camera and a frustum visualization.

### Part D – Curves

I used three connected cubic Bezier segments to trace the deer's contour in the painting. The control points can be moved with the mouse.

I also implemented de Casteljau interpolation and a Catmull–Rom curve option. The sidebar lets me change the curve type, select a segment and adjust the interpolation parameter.

The curve can be exported as a JSON file.

### Part E – Final Scene

I combined the different parts into one application. The main scene includes the painting, a 3D forest and a deer. I added controls to switch between scenes, reset the camera and pause animations.

I also displayed the frame time and vertex count to compare the different scenes.

## Controls

Most of the controls are in the sidebar. I can use them to:

- Switch between the three scene modes.
- Change the camera position and projection type.
- Adjust translation, rotation and scale.
- Compare TRS and SRT matrices.
- Show or hide the scene graph axes.
- Change the curve type and edit its control points.
- Adjust the de Casteljau parameter.
- Export the curve as JSON.
- Pause animations or reset the scene.

I can also drag the canvas to rotate the camera and use the mouse wheel to zoom.

## Project Structure

I separated the code into different files to keep it organized.

- `src/main.js` contains the main rendering loop and connects the different parts of the application.
- `src/math/` contains the matrix operations.
- `src/scene/` contains the scene graph implementation.
- `src/render/` contains the shaders, geometry and painting rendering code.
- `src/curves/` contains the Bézier and Catmull–Rom functions.
- `src/camera.js` contains the camera and projection calculations.
- `src/ui.js` contains some of the UI and performance functions.

I stored the painting in `assets/` and the contour control points in `curve.json`.

## Curve JSON

I saved the initial curve in `curve.json`. It contains 10 control points and 3 Bézier segments. The coordinates are normalized between 0 and 1, using the top-left corner of the painting as the origin.

I checked the JSON format, control point coordinates and segment indices using Node.js.

The application downloads a new JSON file with the current control points when I use the export button. It does not automatically change the original file.

## Notes

I developed and tested the application using WebGPU. It requires a compatible browser and GPU.

The frame-time value shown in the application is based on animation frames so it is not a direct measurement of GPU execution time.

The 3D forest is my simplified interpretation of the painting rather than an exact recreation.
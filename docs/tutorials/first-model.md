# 1. Create your first cube model

Build a simple model from an empty scene, change its position and shape numerically, and learn how the four views relate to the perspective view.

**Before you start:** Open Ortho using the [getting-started instructions](/getting-started). You need a desktop browser with WebGL2.

**Time:** about 5–10 minutes. Screenshots show the dark desktop interface; click them for full size.

## 1. Start an empty scene

Choose **File → New project**. The robot sample disappears and the scene hierarchy becomes empty. New project is undoable if you need to return to the previous scene.

[![New project starts with an empty scene and four viewports.](/tutorials/model-01-new.png)](/tutorials/model-01-new.png)

*New project starts with an empty scene and four viewports.*

## 2. Add a cube

In **Add primitive**, click **Cube**. **Cube 1** appears in the scene hierarchy and is selected.

[![Cube 1 is selected in the four-view workspace.](/tutorials/model-02-cube.png)](/tutorials/model-02-cube.png)

*Cube 1 is selected in the four-view workspace.*

## 3. Move it slightly

In the selected mesh's **Position** fields, set **X = 0.25**. Leave **Y = 0** and **Z = 0**.

## 4. Make it taller

Under **Scale**, set **Y = 1.5**. Leave **X = 1** and **Z = 1**. This changes the model's height without changing its width.

## 5. Turn it slightly

Under **Rotation (degrees)**, set **Y = 15**. Do not change the other rotation fields.

[![The inspector contains the position, rotation, and scale used for the tutorial model.](/tutorials/model-03-transform.png)](/tutorials/model-03-transform.png)

*The inspector contains the position, rotation, and scale used for the tutorial model.*

## 6. Compare the views

Look at **Front**, **Top**, **Side**, and **Perspective**. They show the same mesh from different cameras. Orbit in Perspective with middle-drag; wheel zooms.

## 7. Use a larger perspective view

Choose **View → Four views / maximize 3D**. The perspective view fills the workspace. Choose the same command again whenever you want four views.

[![The finished cube is shown in the maximized perspective view.](/tutorials/model-04-finished.png)](/tutorials/model-04-finished.png)

*The finished cube is shown in the maximized perspective view.*

## 8. Save the model

Click **Save project**. Keep the `.pvo` download as **first-cube.pvo**; your browser may initially suggest **Untitled.pvo**.

## Finished result

One cube with Position X 0.25, Scale Y 1.5, and Rotation Y 15°.

<a href="/tutorials/first-cube.pvo" download>Download the finished project</a>.

## If something looks different

Click **Cube 1** in the hierarchy if the transform fields are missing. Mesh rotation fields use **degrees**; the animation lesson uses a separate radians field.

[Next: 2. Paint and adjust the cube's texture](/tutorials/paint-cube)

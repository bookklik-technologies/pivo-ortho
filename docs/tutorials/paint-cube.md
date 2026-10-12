# 2. Paint and adjust the cube's texture

Paint a blue atlas with a yellow stripe, then nudge a selected face's UVs while watching the real model preview.

**Before you start:** Continue from [Create your first cube model](/tutorials/first-model), or download <a href="/tutorials/first-cube.pvo" download>first-cube.pvo</a> and choose **File → Open project…**.

**Time:** about 5–10 minutes. Screenshots show the dark desktop interface; click them for full size.

## 1. Return to four views

If only Perspective is visible, choose **View → Four views / maximize 3D**. Stay in **Model** mode.

## 2. Select a face

Choose **Pick face** in the inspector and click inside the cube in the **Front** viewport. Confirm the inspector shows a **Face** section and **Textured** is enabled.

[![A cube face is selected before switching workspaces.](/tutorials/paint-01-face.png)](/tutorials/paint-01-face.png)

*A cube face is selected before switching workspaces.*

## 3. Open the paint workspace

Click the **Paint** mode tab and keep its **Texture** tab selected. The atlas is fixed at **128×128** pixels.

## 4. Fill the atlas blue

Choose palette **index 12 (#6aaed1)** and **Flood fill (4-connected)**. Click an empty area of the atlas, such as pixel **(64, 64)**. All of the initially uniform atlas becomes blue.

[![The atlas and the model preview both use the blue palette color.](/tutorials/paint-02-fill.png)](/tutorials/paint-02-fill.png)

*The atlas and the model preview both use the blue palette color.*

## 5. Paint a yellow stripe

Choose palette **index 10 (#eddb79)**, select **Pen**, and set the toolbar's **Brush = 5**. Drag across atlas pixels **(10, 12)–(22, 12)**. Coordinates start at the top-left of the atlas.

[![A yellow stroke on the shared atlas appears on the textured cube.](/tutorials/paint-03-stripe.png)](/tutorials/paint-03-stripe.png)

*A yellow stroke on the shared atlas appears on the textured cube.*

## 6. Switch to UV editing

Click the **UV** tab within Paint. The face selection survives the mode switch. Its UV handles identify which part of the atlas it samples.

## 7. Nudge the selected face

Click **Nudge UVs right** once. Compare the preview with the previous state: the selected face now samples a slightly shifted part of the stripe.

[![UV controls and the scene preview show the selected face after one rightward nudge.](/tutorials/paint-04-uv.png)](/tutorials/paint-04-uv.png)

*UV controls and the scene preview show the selected face after one rightward nudge.*

## 8. Save the painted cube

Click **Save project** and keep the download as **painted-cube.pvo**. The atlas and UV edits are both stored in the native project.

## Finished result

A blue cube with yellow texture detail and a rightward UV adjustment on one face.

<a href="/tutorials/painted-cube.pvo" download>Download the finished project</a>.

## If something looks different

The atlas is shared across faces, so painting it can change several faces at once. If UV controls have no selected face, return to Model, choose **Pick face**, and click a face again. Do not choose palette index 0 unless you intend transparency.

[Previous: 1. Create your first cube model](/tutorials/first-model) · [Next: 3. Rotate the cube and export a GIF](/tutorials/animate-export)

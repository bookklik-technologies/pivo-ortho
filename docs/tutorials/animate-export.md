# 3. Rotate the cube and export a GIF

Add one full Y-axis turn over two seconds, preview it, save the editable animation, and export a small GIF.

**Before you start:** Continue from [Paint and adjust the cube's texture](/tutorials/paint-cube), or open <a href="/tutorials/painted-cube.pvo" download>painted-cube.pvo</a>.

**Time:** about 5–10 minutes. Screenshots show the dark desktop interface; click them for full size.

## 1. Choose the mesh and Animate mode

Select **Cube 1** in the scene hierarchy or the Animate **Mesh** chooser, then click **Animate**.

[![Animate mode shows the cube preview and its four empty tracks.](/tutorials/animate-01-workspace.png)](/tutorials/animate-01-workspace.png)

*Animate mode shows the cube preview and its four empty tracks.*

## 2. Add a rotation clip

In **Clip properties**, open **Add clip → Rotation**. The new clip is selected automatically.

## 3. Configure one complete turn

Set the clip's **Start (s) = 0**, **Duration (s) = 2**, **Axis = Y**, and **Amount (radians) = 6.283185**. Keep **Track = 0** and **Easing = linear**. The amount is approximately 2π radians: one full turn.

## 4. Set the timeline duration

Set the toolbar's **Duration (s) = 2**, or use **Timeline options → Duration (s)** if the compact control is shown. Leave **FPS = 12**.

[![A two-second rotation clip uses Y and approximately 2π radians.](/tutorials/animate-02-clip.png)](/tutorials/animate-02-clip.png)

*A two-second rotation clip uses Y and approximately 2π radians.*

## 5. Preview the movement

Click **Play**, watch the cube rotate, then click **Pause**. Scrubbing the timeline also lets you inspect intermediate poses.

[![The animation preview shows an intermediate rotation pose.](/tutorials/animate-03-preview.png)](/tutorials/animate-03-preview.png)

*The animation preview shows an intermediate rotation pose.*

## 6. Save and reopen the animation

Click **Save project**, keep the file as **rotating-cube.pvo**, then use **File → Open project…** to reopen it. Confirm its rotation clip and two-second timeline are retained.

## 7. Configure the animated export

Click **Export**. Set **Format = Animated GIF**, **Source = Animation (timeline)**, **Frame count = 24**, and **Frame size = 128**. Click **Fit model** under Export camera.

[![The GIF export uses the timeline, 24 frames, and 128-pixel frames.](/tutorials/animate-04-export.png)](/tutorials/animate-04-export.png)

*The GIF export uses the timeline, 24 frames, and 128-pixel frames.*

## 8. Export and view the GIF

Click the dialog's **Export** button and wait for capture and encoding to finish. Open the downloaded `.gif` in a browser. Keep `.pvo` as well so you can edit the clip later.

## Finished result

A rotating-cube `.pvo` project and a 24-frame GIF covering the two-second timeline.

<a href="/tutorials/rotating-cube.pvo" download>Download the finished project</a>.

- [Animated GIF](/tutorials/rotating-cube.gif)

## If something looks different

Choose **Animation (timeline)** rather than **Turntable (camera orbit)** to export your clip. Clip rotation amounts are **radians**, unlike model rotation fields. If the preview is cropped, use **Fit model**. GIF delays are rounded to 10 ms: this example exports 24 frames at 80 ms each, so GIF playback takes 1.92 seconds rather than exactly matching the two-second editor timeline.

[Previous: 2. Paint and adjust the cube's texture](/tutorials/paint-cube) · [Back to tutorials](/tutorials/)

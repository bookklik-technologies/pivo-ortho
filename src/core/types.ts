export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
export type Primitive = 'cube' | 'plane' | 'pyramid' | 'cylinder' | 'prism';
export interface Vertex { id: string; position: Vec3 }
export interface Face { id: string; vertices: string[]; uv: Vec2[]; color: number; doubleSided: boolean; shaded: boolean; textured: boolean; drawBehind: boolean }
export interface Mesh { id: string; name: string; vertices: Vertex[]; faces: Face[]; position: Vec3; rotation: Vec3; scale: Vec3; pivot: Vec3; visible: boolean; locked: boolean; folderId: string | null }
export interface Folder { id: string; name: string; visible: boolean; locked: boolean }
export interface Texture { width: 128; height: 128; pixels: number[]; palette: string[]; transparent: number; background: number; shadeRamps: number[][] }
export type ClipType = 'movement' | 'rotation' | 'scale' | 'visibility' | 'oscillation';
export type Curve = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export interface Clip { id: string; meshId: string; track: number; type: ClipType; axis: Axis; start: number; duration: number; amount: number; curve: Curve; pingPong: boolean; frequency: number; property: 'movement' | 'rotation' | 'scale' }
export interface Animation { duration: number; fps: number; clips: Clip[] }
export interface RenderSettings { background: string; shading: boolean; wireframe: boolean; pixelSize: number; affine: boolean; light: Vec3 }
export interface Project { format: 'pivo-ortho'; version: 1; name: string; meshes: Mesh[]; folders: Folder[]; texture: Texture; animation: Animation; render: RenderSettings }
export interface Pose { position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean }
export interface UVEdit { offset?: Vec2; scale?: Vec2; rotation?: number; flipX?: boolean; flipY?: boolean }
export interface ExportFile { name: string; data: Uint8Array | string; mime: string }
export interface ExportBundle { files: ExportFile[]; warnings: string[]; animationsExported?: boolean }
export interface SpriteSettings { frameSize: number; frames: number; columns: number; transparent: boolean }
export type RasterTool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'fill';
// Coordinates: right-handed Y-up; rotations in radians; UVs in texture pixels,
// top-left origin. mesh local transform: position + pivot + R*S*(vertex - pivot).
// These contracts are independent design decisions, not proprietary file formats.

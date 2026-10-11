import {it,expect} from 'vitest';
import {loadExportCameraSettings,saveExportCameraSettings,clearExportCameraSettings} from '../src/ui/camera';
function denied(run:()=>void){const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('opaque sandbox')}});try{run()}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage')}}
it('Storage read stays safe when the storage getter itself throws',()=>denied(()=>expect(loadExportCameraSettings()).toBeNull()));
it('Storage save and clear stay safe with an unavailable storage getter',()=>denied(()=>{expect(()=>saveExportCameraSettings({yaw:1})).not.toThrow();expect(()=>clearExportCameraSettings()).not.toThrow()}));

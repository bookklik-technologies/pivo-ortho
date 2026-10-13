import {it,expect} from 'vitest';
import {encodePNG} from '../src/io/png';
import {validatePngBytes,pngCrc32,PNG_LIMITS} from '../src/io/png-validation';

it('accepts a complete PNG with validated scanlines and dimensions',()=>{
 const bytes=encodePNG(2,1,new Uint8Array([255,0,0,255,0,255,0,255]));
 expect(validatePngBytes(bytes)).toMatchObject({width:2,height:1,colorType:6});
});
it('rejects input above 32 MiB before decoding',()=>{
 expect(()=>validatePngBytes(new Uint8Array(PNG_LIMITS.maxBytes+1))).toThrow('byte budget');
});
it.each([[16385,1],[4097,4096]])('rejects header dimensions %i by %i before allocating pixels',(width,height)=>{
 const bytes=encodePNG(1,1,new Uint8Array([0,0,0,255]));
 const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);
 view.setUint32(29,pngCrc32(bytes.subarray(12,29)));
 expect(()=>validatePngBytes(bytes)).toThrow('dimensions/pixels');
});
it('rejects corrupt PNG bytes before browser image decoding',()=>{
 const bytes=encodePNG(1,1,new Uint8Array([0,0,0,255]));bytes[20]^=1;
 expect(()=>validatePngBytes(bytes)).toThrow('CRC');
});

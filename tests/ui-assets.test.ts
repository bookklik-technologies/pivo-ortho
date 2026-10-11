import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as Icons from '../src/ui/icons';
describe('Bundled Lucide UI icons',()=>{
 it('Every adapter renders a real Lucide SVG with consistent decoration semantics',()=>{for(const [name,Icon] of Object.entries(Icons)){const markup=renderToStaticMarkup(React.createElement(Icon));expect(markup, name).toContain('lucide');expect(markup,name).toContain('viewBox="0 0 24 24"');expect(markup,name).toContain('aria-hidden="true"');expect(markup,name).toContain('width="16"');expect(markup,name).not.toContain('viewBox="0 0 16 16"')}});
 it('Wrappers preserve existing SVG customization without changing control labels',()=>{const html=renderToStaticMarkup(React.createElement(Icons.IconCube,{width:20,height:20,className:'sample'}));expect(html).toContain('width="20"');expect(html).toContain('sample');expect(html).toContain('lucide')});
});

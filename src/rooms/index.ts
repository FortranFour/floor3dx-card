// Registers floor3dx-rooms-card and its editor beside floor3dx-card (one bundle, one HACS install).
import { Floor3dxRoomsCard } from './rooms-card';
import './rooms-editor';

if (!customElements.get('floor3dx-rooms-card')) customElements.define('floor3dx-rooms-card', Floor3dxRoomsCard);
(window as any).customCards = (window as any).customCards || [];
if (!(window as any).customCards.some((c: any) => c.type === 'floor3dx-rooms-card')) {
  (window as any).customCards.push({
    type: 'floor3dx-rooms-card',
    name: 'Floor3DX Rooms',
    preview: false,
    description: 'Your floor3dx model as a full-page room controller: tap a room for its controls, overlaid on the live 3D view, in one of 40 themes',
    documentationURL: 'https://github.com/FortranFour/floor3dx-card#floor3dx-rooms-card',
  });
}

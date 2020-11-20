import { Texture } from "./bsp";
import { extract } from "./binary";

const magic = 0x57414433;

interface Header {
    id: number; // char[4] or uint32 with correct magic
    textures: number; //uint32
    offset: number; //uint32
}

interface Lump {
    offset: number; // uint32
    diskSize: number; // uint32
    size: number; // uint32
    type: number; // int8
    compressed: number; // int8
    // 2 bytes of padding
    name: string; // char[16]
}

const LUMP_SIZE = 144;
const TEXTURE_SIZE = 16 + 4 * 6;

export interface Wad {
    header: Header;
    textures: { [name: string]: Texture }
}

function parseHeader(buffer: ArrayBuffer): Header {
    const view = new DataView(buffer);
    const id = view.getUint32(0, false);

    if (id !== magic) throw new Error("Not a supported WAD");

    const textures = view.getUint32(4, true);
    const offset = view.getUint32(8, true);

    return {
        id,
        textures,
        offset
    };
}

export function parseWad(buffer: ArrayBuffer): Wad {

    const header = parseHeader(buffer);

    const start = header.offset;
    const end = header.offset + (LUMP_SIZE * (header.textures));
    const data = extract(new DataView(buffer.slice(start, end)), ["Uint32", "Uint32", "Uint32", "Uint8", "Uint8", "Uint16", "Char16"]);
    const dirs = data.map((entry): Lump => {
        return {
            offset: entry[0],
            diskSize: entry[1],
            size: entry[2],
            type: entry[3],
            compressed: entry[4], // Skip over entry[5] it's padding
            name: entry[6]
        }
    });

    const tex = dirs.map((dir): Texture => {
        const data = extract(new DataView(buffer, dir.offset, TEXTURE_SIZE), ["Char16", "Uint32", "Uint32", "Uint32", "Uint32", "Uint32", "Uint32"])[0];

        return {
            name: dir.name,
            width: data[1],
            height: data[2],
            offset1: data[3],
            offset2: data[4],
            offset4: data[5],
            offset8: data[6],
            palette: null,
            globalOffset: dir.offset
        }
    });

    const textures: { [key: string]: Texture } = {};

    tex.forEach(t => {
        const mip = t.globalOffset + t.offset1;
        t.pixels = new Uint8Array(buffer.slice(mip, mip + (t.width * t.height)));

        console.log(t.name);

        const palleteOffset = t.globalOffset + t.offset8 + Math.floor((t.width * t.height) / 64) + 2;
        const paletteArray = new Uint8Array(buffer.slice(palleteOffset, palleteOffset + (256 * 3)));
        let palette: number[][] = [];

        for (let i = 0; i < 256; i++) {
            palette.push([paletteArray[i * 3], paletteArray[i * 3 + 1], paletteArray[i * 3 + 2]]);
        }

        t.palette = palette;

        textures[t.name] = t;
    });

    return {
        header,
        textures
    }
}
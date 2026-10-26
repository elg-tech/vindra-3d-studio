import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  normalizeColor,
  parseBambu3mf,
  parseDuration,
  parseGcodeHeader,
  parseSliceInfo,
  toMaterial,
} from "@/lib/bambu3mf";

// Estrutura do slice_info.config gerado pelo Bambu Studio (mesa fatiada, A1 com AMS Lite).
const SLICE_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="01.09.07.52"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="N2S"/>
    <metadata key="nozzle_diameters" value="0.4"/>
    <metadata key="prediction" value="5025"/>
    <metadata key="weight" value="42.18"/>
    <metadata key="outside" value="false"/>
    <object identify_id="123" name="Suporte Controle Xbox" skipped="false" />
    <object identify_id="124" name="Peça pulada" skipped="true" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="11.52" used_g="34.30" />
    <filament id="2" tray_info_idx="GFA00" type="PLA" color="#FFFFFFFF" used_m="2.81" used_g="7.88" />
    <filament id="3" tray_info_idx="GFG00" type="PETG" color="#FF0000" used_m="0" used_g="0" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value=""/>
    <metadata key="weight" value=""/>
  </plate>
</config>`;

const GCODE_HEADER = `; HEADER_BLOCK_START
; BambuStudio 01.09.07.52
; model printing time: 1h 22m 20s; total estimated time: 1h 28m 46s
; total layer number: 100
; total filament length [mm] : 11516.88,2810.10
; total filament weight [g] : 34.30,7.88
; HEADER_BLOCK_END
; CONFIG_BLOCK_START
; filament_type = PLA;PLA Silk
; filament_colour = #000000;#C0C0C0
; CONFIG_BLOCK_END
G28
`;

async function zipWith(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("3D/3dmodel.model", "<model/>");
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("utilitários", () => {
  it("parseDuration", () => {
    expect(parseDuration("1h 28m 46s")).toBe(5326);
    expect(parseDuration("45m 10s")).toBe(2710);
    expect(parseDuration("1d 2h")).toBe(93600);
    expect(parseDuration("rápido")).toBeNull();
  });

  it("normalizeColor", () => {
    expect(normalizeColor("#FFFFFFFF")).toBe("#ffffff");
    expect(normalizeColor("00AE42")).toBe("#00ae42");
    expect(normalizeColor("")).toBe("#888888");
  });

  it("toMaterial", () => {
    expect(toMaterial("PLA")).toBe("PLA");
    expect(toMaterial("PLA Silk")).toBe("PLA Silk");
    expect(toMaterial("PLA-CF")).toBe("PLA");
    expect(toMaterial("PETG")).toBe("PETG");
    expect(toMaterial("PA6-CF")).toBe("Outro");
  });
});

describe("parseSliceInfo", () => {
  it("extrai tempo, peso e filamentos usados por mesa", () => {
    const [plate1, plate2] = parseSliceInfo(SLICE_INFO);
    expect(plate1).toEqual({
      index: 1,
      printSeconds: 5025,
      weightG: 42.18,
      objects: ["Suporte Controle Xbox"],
      filaments: [
        { slot: 1, type: "PLA", material: "PLA", color: "#000000", grams: 34.3 },
        { slot: 2, type: "PLA", material: "PLA", color: "#ffffff", grams: 7.88 },
      ],
    });
    // mesa não fatiada
    expect(plate2.printSeconds).toBe(0);
    expect(plate2.filaments).toEqual([]);
  });
});

describe("parseGcodeHeader", () => {
  it("usa o tempo total e o peso por filamento", () => {
    expect(parseGcodeHeader(GCODE_HEADER)).toEqual({
      index: 1,
      printSeconds: 5326,
      weightG: 42.18,
      objects: [],
      filaments: [
        { slot: 1, type: "PLA", material: "PLA", color: "#000000", grams: 34.3 },
        { slot: 2, type: "PLA Silk", material: "PLA Silk", color: "#c0c0c0", grams: 7.88 },
      ],
    });
  });

  it("sem tempo ou peso → null", () => {
    expect(parseGcodeHeader("G28\nG1 X10")).toBeNull();
  });
});

describe("parseBambu3mf", () => {
  it("arquivo fatiado: lê o slice_info e ignora mesas vazias", async () => {
    const r = await parseBambu3mf(await zipWith({ "Metadata/slice_info.config": SLICE_INFO }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("slice_info");
    expect(r.plates).toHaveLength(1);
    expect(r.plates[0].printSeconds).toBe(5025);
  });

  it("sem slice_info útil: cai para o cabeçalho do G-code", async () => {
    const r = await parseBambu3mf(
      await zipWith({
        "Metadata/slice_info.config": "<config><plate><metadata key=\"index\" value=\"1\"/></plate></config>",
        "Metadata/plate_1.gcode": GCODE_HEADER,
      }),
    );
    expect(r.ok && r.source).toBe("gcode");
    expect(r.ok && r.plates[0].filaments).toHaveLength(2);
  });

  it("projeto não fatiado → mensagem pedindo a mesa fatiada", async () => {
    const r = await parseBambu3mf(await zipWith({ "Metadata/model_settings.config": "<config/>" }));
    expect(r).toMatchObject({ ok: false, code: "not_sliced" });
    expect(!r.ok && r.error).toContain("Exportar arquivo de mesa fatiada");
  });

  it("arquivo real: projeto do Bambu Studio 2.4 salvo sem fatiar → not_sliced", async () => {
    // slice_info.config extraído de um .3mf real (A1 mini, 2× PLA, torre ligada) que não foi fatiado:
    // só tem o cabeçalho, sem <plate>, e o zip não tem Metadata/plate_1.gcode.
    const sliceInfo = readFileSync(
      fileURLToPath(new URL("./fixtures/bambu-2.4-projeto-nao-fatiado/slice_info.config", import.meta.url)),
      "utf8",
    );
    const r = await parseBambu3mf(await zipWith({ "Metadata/slice_info.config": sliceInfo }));
    expect(r).toMatchObject({ ok: false, code: "not_sliced" });
  });

  it(".3mf de outro programa → not_bambu", async () => {
    const r = await parseBambu3mf(await zipWith({}));
    expect(r).toMatchObject({ ok: false, code: "not_bambu" });
  });

  it("arquivo que não é zip → invalid_file", async () => {
    const r = await parseBambu3mf(new TextEncoder().encode("isto não é um 3mf"));
    expect(r).toMatchObject({ ok: false, code: "invalid_file" });
  });
});

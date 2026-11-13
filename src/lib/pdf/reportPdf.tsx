import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatWib } from "../date";
import { MONITORING_STATUS } from "../monitoring";
import { groupMean, histogram, type ReportRow } from "../report";
import type { IdentitySettings } from "../settings";

/**
 * PDF ringkas report (FR-11.06), rapor per peserta (FR-11.06, FR-12.04), tanda terima (FR-07.10).
 * Header: banner Kota Pontianak + DISPERPUSIP (kiri) dan logo LibCon (kanan).
 * shortcut: radar di rapor digambar sebagai tabel nilai, bukan grafik.
 */

// file ikut dibundel ke fungsi server lewat outputFileTracingIncludes (next.config.ts); hilang → PDF tanpa logo itu
function dataUri(file: string) {
  try {
    return `data:image/png;base64,${readFileSync(path.join(process.cwd(), "public", file)).toString("base64")}`;
  } catch {
    return null;
  }
}
const LOGO_DINAS = dataUri("logo-disperpusip.png");
const LOGO_LIBCON = dataUri("logo-libcon.png");

/* eslint-disable jsx-a11y/alt-text -- Image react-pdf (isi PDF), bukan <img> HTML; tidak punya prop alt */
function Logo() {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      {LOGO_DINAS ? <Image src={LOGO_DINAS} style={{ width: 180 }} /> : <View />}
      {LOGO_LIBCON && <Image src={LOGO_LIBCON} style={{ height: 40 }} />}
    </View>
  );
}
/* eslint-enable jsx-a11y/alt-text */

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  h1: { fontSize: 15, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 11, marginTop: 12, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ccc", paddingVertical: 2 },
  big: { fontSize: 28, fontFamily: "Helvetica-Bold" },
});

const fmt2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt3 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function Table({ widths, header, rows }: { widths: number[]; header: string[]; rows: (string | number)[][] }) {
  return (
    <View>
      <View style={[s.row, { fontFamily: "Helvetica-Bold" }]}>
        {header.map((h, i) => (
          <Text key={i} style={{ width: `${widths[i]}%` }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, j) => (
        <View key={j} style={s.row} wrap={false}>
          {r.map((c, i) => (
            <Text key={i} style={{ width: `${widths[i]}%` }}>
              {String(c)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

type Scored = ReportRow & { score: NonNullable<ReportRow["score"]> };
const isScored = (r: ReportRow): r is Scored => !!r.score;

export function renderSummaryPdf(rows: ReportRow[], filterLabel: string) {
  const scored = rows.filter(isScored).sort((a, b) => b.score.indexScore - a.score.indexScore);
  const counts = Object.entries(MONITORING_STATUS)
    .map(([k, v]) => [v.label, rows.filter((r) => r.status === k).length] as const)
    .filter(([, n]) => n > 0);
  return renderToBuffer(
    <Document title="Laporan ringkas LibCon">
      <Page size="A4" style={s.page}>
        <Logo />
        <Text style={s.h1}>Laporan Ringkas Lomba Perpustakaan</Text>
        <Text style={s.muted}>Dicetak {formatWib(new Date())} · {filterLabel}</Text>
        <Text style={s.h2}>Status pengisian ({rows.length} lembaga)</Text>
        <Table widths={[70, 30]} header={["Status", "Jumlah"]} rows={counts.map(([l, n]) => [l, n])} />
        <Text style={s.h2}>Sebaran indeks ({scored.length} berskor)</Text>
        <Table widths={[70, 30]} header={["Rentang", "Jumlah"]} rows={histogram(scored.map((r) => r.score.indexScore)).map((b) => [`${b.from}–${b.to}`, b.count])} />
        <Text style={s.h2}>Rata-rata indeks per kecamatan</Text>
        <Table widths={[60, 20, 20]} header={["Kecamatan", "Rata-rata", "n"]} rows={groupMean(scored, (r) => r.districtName, (r) => r.score.indexScore).map((g) => [g.group, fmt2.format(g.mean), g.n])} />
        <Text style={s.h2}>Ranking</Text>
        <Table
          widths={[8, 40, 16, 12, 24]}
          header={["#", "Lembaga", "Jenis", "Indeks", "Kategori"]}
          rows={scored.map((r) => [r.score.rankOverall ?? "", r.libraryName, r.typeName, fmt2.format(r.score.indexScore), r.score.categoryName ?? ""])}
        />
      </Page>
    </Document>,
  );
}

/** FR-07.10: lampiran email tanda terima — waktu kirim + ringkasan jawaban soal yang tampil. */
export function renderReceiptPdf(r: {
  libraryName: string;
  npp: string;
  periodName: string;
  submittedAt: Date;
  submitterName: string;
  sections: { title: string; evidenceUrl: string; rows: { code: string; label: string; answer: string }[] }[];
}) {
  return renderToBuffer(
    <Document title={`Tanda terima ${r.libraryName}`}>
      <Page size="A4" style={s.page}>
        <Logo />
        <Text style={s.h1}>Tanda Terima Pengiriman Survei</Text>
        <Text>{r.libraryName}</Text>
        <Text style={s.muted}>
          NPP {r.npp} · {r.periodName}
        </Text>
        <Text style={{ marginTop: 6 }}>
          Dikirim {formatWib(r.submittedAt)} oleh {r.submitterName}
        </Text>
        {r.sections.map((sec) => (
          <View key={sec.title}>
            <Text style={s.h2}>{sec.title}</Text>
            {sec.evidenceUrl && <Text style={s.muted}>Bukti dukung: {sec.evidenceUrl}</Text>}
            <Table widths={[20, 50, 30]} header={["Kode", "Soal", "Jawaban"]} rows={sec.rows.map((x) => [x.code, x.label, x.answer || "–"])} />
          </View>
        ))}
      </Page>
    </Document>,
  );
}

/** Rapor satu lembaga; `peers` = kiriman berskor jenis yang sama di periode yang sama (pembanding rata-rata). */
export function renderRaporPdf(row: Scored, peers: ReportRow[], showRanking: boolean, identity: IdentitySettings) {
  const nodes = Object.entries(row.score.nodeInfo ?? {}).sort(([a, x], [b, y]) => (x.level === y.level ? a.localeCompare(b) : x.level === "DIMENSION" ? -1 : 1));
  const peerMean = (code: string) => groupMean(peers.filter(isScored), () => "x", (r) => r.score.nodes[code])[0]?.mean;
  return renderToBuffer(
    <Document title={`Rapor ${row.libraryName}`}>
      <Page size="A4" style={s.page}>
        <Logo />
        {identity.libraryName && (
          <Text style={s.muted}>
            {identity.libraryName}
            {identity.address ? ` · ${identity.address}` : ""}
          </Text>
        )}
        <Text style={s.h1}>Rapor Penilaian Perpustakaan</Text>
        <Text>{row.libraryName}</Text>
        <Text style={s.muted}>
          NPP {row.npp} · {row.typeName} · Kec. {row.districtName} · {row.periodName}
        </Text>
        <View style={{ flexDirection: "row", gap: 24, marginTop: 12, alignItems: "flex-end" }}>
          <View>
            <Text style={s.muted}>Indeks</Text>
            <Text style={s.big}>{fmt2.format(row.score.indexScore)}</Text>
          </View>
          <View>
            <Text style={s.muted}>Kategori</Text>
            <Text style={{ fontSize: 14 }}>{row.score.categoryName ?? "–"}</Text>
          </View>
          {showRanking && (
            <View>
              <Text style={s.muted}>Peringkat (keseluruhan / jenis / kecamatan)</Text>
              <Text style={{ fontSize: 14 }}>
                {row.score.rankOverall ?? "–"} / {row.score.rankInType ?? "–"} / {row.score.rankInDistrict ?? "–"}
              </Text>
            </View>
          )}
        </View>
        <Text style={s.h2}>Dimensi & subdimensi</Text>
        <Table
          widths={[45, 20, 15, 20]}
          header={["Komponen", "Tingkat", "Nilai", `Rata-rata ${row.typeName}`]}
          rows={nodes.map(([code, info]) => {
            const m = peerMean(code);
            return [info.name, info.level === "DIMENSION" ? "Dimensi" : "Subdimensi", fmt3.format(row.score.nodes[code] ?? 0), m === undefined ? "–" : fmt3.format(m)];
          })}
        />
        <Text style={[s.muted, { marginTop: 16 }]}>Skema skor versi {row.score.schemeVersion}. Dicetak {formatWib(new Date())}.</Text>
        {identity.signerName && (
          <View style={{ marginTop: 32, alignSelf: "flex-end", alignItems: "center" }}>
            <Text>{identity.signerTitle}</Text>
            <Text style={{ marginTop: 40, fontFamily: "Helvetica-Bold" }}>{identity.signerName}</Text>
          </View>
        )}
      </Page>
    </Document>,
  );
}

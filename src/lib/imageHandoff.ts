/**
 * Image handoff package generators — the core imageHandoff* family
 * (document-scope report / TSV / JSON / source manifest / package
 * checklist / blockers / collect + verify script builders).
 *
 * Moved verbatim from selectionOps.ts (behaviour identical). Shared image
 * helpers (link detection, links summary, artboard scoping) still live in
 * selectionOps and are imported from there.
 */

import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import {
  isImageObject,
  imageSource,
  isEmbeddedImageObject,
  isLinkedImageObject,
  isMissingLinkedImageObject,
  imageNaturalDimensions,
  imageEffectivePpi,
  imageMatchesSummaryScope,
  isRestorableEmbeddedImageObject,
  isEmbeddableLinkedImageObject,
  isNotEmbeddableLinkedImageObject,
  collectImageLinksSummary,
  imageLinksSummary,
  type ImageLinksSummary,
} from './selectionOps';

type ImageHandoffDetail = {
  index: number;
  name: string;
  source: string;
  status: 'missing linked' | 'not embeddable' | 'unknown source' | 'embeddable linked' | 'restorable embedded' | 'embedded' | 'linked';
  severity: 'error' | 'warning' | 'info' | 'ok';
  action: string;
  pixels: string;
  effectivePpi: string;
};

function imageHandoffActionForStatus(status: ImageHandoffDetail['status']): Pick<ImageHandoffDetail, 'severity' | 'action'> {
  switch (status) {
    case 'missing linked': return { severity: 'error', action: 'relink before package' };
    case 'not embeddable': return { severity: 'error', action: 'replace source or embed manually' };
    case 'unknown source': return { severity: 'warning', action: 'relink or confirm embedded provenance' };
    case 'embeddable linked': return { severity: 'info', action: 'embed or collect linked file' };
    case 'restorable embedded': return { severity: 'info', action: 'restore link if external asset workflow is required' };
    case 'embedded': return { severity: 'ok', action: 'ready' };
    case 'linked': return { severity: 'ok', action: 'collect linked file' };
  }
}

function imageHandoffDetailForObject(object: fabric.FabricObject, index: number): ImageHandoffDetail | null {
  if (!isImageObject(object)) return null;
  const image = object as fabric.FabricImage & { name?: unknown; anchorworksOriginalLinkSource?: unknown };
  const source = imageSource(image).trim();
  const originalSource = typeof image.anchorworksOriginalLinkSource === 'string' ? image.anchorworksOriginalLinkSource.trim() : '';
  let status: ImageHandoffDetail['status'];
  if (isMissingLinkedImageObject(object)) status = 'missing linked';
  else if (isNotEmbeddableLinkedImageObject(object)) status = 'not embeddable';
  else if (!source) status = 'unknown source';
  else if (isEmbeddableLinkedImageObject(object)) status = 'embeddable linked';
  else if (isRestorableEmbeddedImageObject(object)) status = 'restorable embedded';
  else if (isEmbeddedImageObject(object)) status = 'embedded';
  else if (isLinkedImageObject(object)) status = 'linked';
  else return null;
  const name = typeof image.name === 'string' && image.name.trim() ? image.name.trim() : `Image ${index}`;
  const dimensions = imageNaturalDimensions(image);
  const effectivePpi = imageEffectivePpi(image);
  const handoff = imageHandoffActionForStatus(status);
  return {
    index,
    name,
    source: source || originalSource || '(unknown source)',
    status,
    ...handoff,
    pixels: dimensions ? `${Math.round(dimensions.width)}×${Math.round(dimensions.height)} px` : 'unknown pixels',
    effectivePpi: effectivePpi === null ? 'unknown PPI' : `${Math.max(1, Math.round(effectivePpi))} PPI`,
  };
}

function collectImageHandoffDetails(inScope?: (object: fabric.FabricObject) => boolean): ImageHandoffDetail[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  const details: ImageHandoffDetail[] = [];
  let imageIndex = 0;
  for (const object of canvas.getObjects()) {
    if (!imageMatchesSummaryScope(object, inScope)) continue;
    imageIndex += 1;
    const detail = imageHandoffDetailForObject(object, imageIndex);
    if (detail) details.push(detail);
  }
  return details;
}

function imageHandoffSeverityCounts(details: ImageHandoffDetail[]): Record<ImageHandoffDetail['severity'], number> {
  return details.reduce(
    (summary, detail) => ({ ...summary, [detail.severity]: summary[detail.severity] + 1 }),
    { error: 0, warning: 0, info: 0, ok: 0 } satisfies Record<ImageHandoffDetail['severity'], number>,
  );
}

function imageHandoffSeveritySummary(details: ImageHandoffDetail[]): string {
  const counts = imageHandoffSeverityCounts(details);
  return `Severity: ${counts.error} error · ${counts.warning} warning · ${counts.info} info · ${counts.ok} ok`;
}

function imageHandoffDetailLines(details: ImageHandoffDetail[]): string[] {
  if (details.length === 0) return ['Assets: none'];
  return [
    'Assets:',
    ...details.map((detail) => `- #${detail.index} ${detail.name}: ${detail.severity} · ${detail.status} · ${detail.action} · ${detail.pixels} · effective ${detail.effectivePpi} · ${detail.source}`),
  ];
}

function imageHandoffTsvCell(value: string): string {
  return value.replace(/[\t\n\r]+/g, ' ').trim();
}

function imageHandoffTsvRows(details: ImageHandoffDetail[]): string[] {
  const header = ['Index', 'Name', 'Severity', 'Status', 'Action', 'Pixels', 'Effective PPI', 'Source'].join('\t');
  return [
    header,
    ...details.map((detail) => [
      String(detail.index),
      detail.name,
      detail.severity,
      detail.status,
      detail.action,
      detail.pixels,
      detail.effectivePpi,
      detail.source,
    ].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffManifestLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const groups: ImageHandoffDetail['action'][] = [
    'relink before package',
    'replace source or embed manually',
    'relink or confirm embedded provenance',
    'embed or collect linked file',
    'restore link if external asset workflow is required',
    'collect linked file',
    'ready',
  ];
  const lines = [`# AnchorWorks Image Source Manifest (${scope})`];
  for (const action of groups) {
    const actionDetails = details.filter((detail) => detail.action === action);
    if (actionDetails.length === 0) continue;
    lines.push(`## ${action} (${actionDetails.length})`);
    for (const detail of actionDetails) {
      lines.push(`- #${detail.index} ${detail.name} · ${detail.severity} · ${detail.status} · ${detail.source}`);
    }
  }
  if (lines.length === 1) lines.push('No image sources in scope.');
  return lines;
}

function imageHandoffManifestReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffManifestLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffExternalPathList(
  details: ImageHandoffDetail[],
  actions: Set<ImageHandoffDetail['action']>,
): string[] {
  const sources = new Set<string>();
  for (const detail of details) {
    const source = detail.source.trim();
    if (!actions.has(detail.action)) continue;
    if (!source || source === '(unknown source)' || /^data:image\//i.test(source)) continue;
    sources.add(source);
  }
  return [...sources];
}

function imageHandoffChecklistDetailLine(detail: ImageHandoffDetail): string {
  return `- #${detail.index} ${detail.name} · ${detail.severity} · ${detail.status} · ${detail.action} · ${detail.source}`;
}

function imageHandoffChecklistSection(title: string, body: string[]): string[] {
  return [`## ${title}`, ...body];
}

const IMAGE_HANDOFF_COLLECT_ACTIONS = new Set<ImageHandoffDetail['action']>(['embed or collect linked file', 'collect linked file']);
const IMAGE_HANDOFF_RELINK_ACTIONS = new Set<ImageHandoffDetail['action']>(['relink before package']);
const IMAGE_HANDOFF_MANUAL_REVIEW_ACTIONS = new Set<ImageHandoffDetail['action']>([
  'replace source or embed manually',
  'relink or confirm embedded provenance',
  'restore link if external asset workflow is required',
]);

function imageHandoffPackageGroups(details: ImageHandoffDetail[]): {
  collectableSources: string[];
  missingSources: string[];
  manualReview: ImageHandoffDetail[];
  ready: ImageHandoffDetail[];
} {
  return {
    collectableSources: imageHandoffExternalPathList(details, IMAGE_HANDOFF_COLLECT_ACTIONS),
    missingSources: imageHandoffExternalPathList(details, IMAGE_HANDOFF_RELINK_ACTIONS),
    manualReview: details.filter((detail) => IMAGE_HANDOFF_MANUAL_REVIEW_ACTIONS.has(detail.action)),
    ready: details.filter((detail) => detail.severity === 'ok'),
  };
}

function imageHandoffPackageRiskTotal(summary: ImageLinksSummary): number {
  return summary.missingLinked + summary.notEmbeddableLinked + summary.unknownSource;
}

function imageHandoffPackageBlockerDetails(details: ImageHandoffDetail[]): ImageHandoffDetail[] {
  return details.filter((detail) => detail.severity === 'error' || detail.status === 'unknown source');
}

function imageHandoffPackageBlockerLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const blockers = imageHandoffPackageBlockerDetails(details);
  const riskTotal = imageHandoffPackageRiskTotal(summary);
  return [
    '# AnchorWorks Image Package Blockers (' + scope + ')',
    'Status: ' + (riskTotal === 0 ? 'ready' : 'blocked') + ' · ' + riskTotal + ' blocker(s)',
    'Blocking counts: ' + summary.missingLinked + ' missing · ' + summary.notEmbeddableLinked + ' not embeddable · ' + summary.unknownSource + ' unknown source',
    ...(blockers.length ? blockers.map(imageHandoffChecklistDetailLine) : ['- none']),
    riskTotal === 0
      ? 'Package gate: ready to collect linked files.'
      : 'Package gate: resolve every blocker before final package delivery.',
  ];
}

function imageHandoffPackageBlockersForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageBlockerLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPathBasename(source: string): string {
  const withoutQuery = source.split(/[?#]/, 1)[0] || source;
  const segments = withoutQuery.split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) || 'linked-image';
}

function imageHandoffSafePackageFilename(source: string): string {
  const basename = [...imageHandoffPathBasename(source)]
    .map((character) => (character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character))
    .join('')
    .trim();
  return basename || 'linked-image';
}

function imageHandoffUniquePackageFilename(source: string, usedNames: Map<string, number>): string {
  const filename = imageHandoffSafePackageFilename(source);
  const dotIndex = filename.lastIndexOf('.');
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  const key = filename.toLocaleLowerCase();
  const count = usedNames.get(key) ?? 0;
  usedNames.set(key, count + 1);
  return count === 0 ? filename : `${stem}-${count + 1}${extension}`;
}

function imageHandoffCollectDestinations(details: ImageHandoffDetail[]): Array<{ source: string; packagePath: string }> {
  const sources = imageHandoffExternalPathList(details, IMAGE_HANDOFF_COLLECT_ACTIONS);
  const usedNames = new Map<string, number>();
  return sources.map((source) => ({
    source,
    packagePath: `Links/${imageHandoffUniquePackageFilename(source, usedNames)}`,
  }));
}

function imageHandoffShellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function imageHandoffPowerShellQuote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function imageHandoffCollectScriptLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    '',
    '# AnchorWorks image package collect script (' + scope + ')',
    'PACKAGE_DIR="${1:-AnchorWorks Package}"',
    'mkdir -p "$PACKAGE_DIR"/Links',
    ...(destinations.length
      ? destinations.map((destination) => 'cp -f -- ' + imageHandoffShellQuote(destination.source) + ' "$PACKAGE_DIR"/' + imageHandoffShellQuote(destination.packagePath))
      : ['echo "No collectable linked image sources."']),
  ];
}

function imageHandoffCollectScriptForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffCollectScriptLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffCollectPowerShellLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  return [
    '$ErrorActionPreference = "Stop"',
    '',
    '# AnchorWorks image package collect script (' + scope + ')',
    'param([string]$PackageDir = "AnchorWorks Package")',
    'New-Item -ItemType Directory -Force -Path (Join-Path $PackageDir "Links") | Out-Null',
    ...(destinations.length
      ? destinations.map((destination) => 'Copy-Item -LiteralPath ' + imageHandoffPowerShellQuote(destination.source) + ' -Destination (Join-Path $PackageDir ' + imageHandoffPowerShellQuote(destination.packagePath) + ') -Force')
      : ['Write-Output "No collectable linked image sources."']),
  ];
}

function imageHandoffCollectPowerShellForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffCollectPowerShellLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffVerifyScriptLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    '',
    '# AnchorWorks image package verify script (' + scope + ')' ,
    'PACKAGE_DIR="${1:-AnchorWorks Package}"',
    'missing=0',
    ...(destinations.length
      ? destinations.map((destination) => 'if [ ! -f "$PACKAGE_DIR"/' + imageHandoffShellQuote(destination.packagePath) + ' ]; then echo "Missing: ' + destination.packagePath + '"; missing=1; fi')
      : ['echo "No collectable linked image sources to verify."']),
    'if [ "$missing" -eq 0 ]; then echo "Package verify passed."; else echo "Package verify failed."; exit 1; fi',
  ];
}

function imageHandoffVerifyScriptForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffVerifyScriptLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageChecklistLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const { collectableSources, missingSources, manualReview, ready } = imageHandoffPackageGroups(details);
  const riskTotal = imageHandoffPackageRiskTotal(summary);
  return [
    `# AnchorWorks Image Package Checklist (${scope})`,
    `Status: ${riskTotal === 0 ? 'ready' : 'needs review'} · ${riskTotal} risk(s)`,
    `Images: ${summary.total} total · ${summary.linked} linked · ${summary.embedded} embedded`,
    ...imageHandoffChecklistSection(
      '1. Relink before package',
      missingSources.length ? missingSources.map((source) => `- ${source}`) : ['- none'],
    ),
    ...imageHandoffChecklistSection(
      '2. Collect linked files',
      collectableSources.length ? collectableSources.map((source) => `- ${source}`) : ['- none'],
    ),
    ...imageHandoffChecklistSection(
      '3. Manual review before handoff',
      manualReview.length ? manualReview.map(imageHandoffChecklistDetailLine) : ['- none'],
    ),
    ...imageHandoffChecklistSection(
      '4. Ready embedded/linked assets',
      ready.length ? ready.map(imageHandoffChecklistDetailLine) : ['- none'],
    ),
    riskTotal === 0
      ? 'Package step: collect listed files, keep embedded assets in the document, and archive this checklist with the handoff.'
      : 'Package step: relink missing sources and resolve manual-review assets before collecting linked files.',
  ];
}

function imageHandoffPackageChecklistForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageChecklistLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffJsonPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const riskTotal = summary.missingLinked + summary.notEmbeddableLinked + summary.unknownSource;
  return {
    scope,
    status: riskTotal === 0 ? 'ready' : 'needs review',
    riskTotal,
    summary,
    severity: imageHandoffSeverityCounts(details),
    assets: details,
  };
}

function imageHandoffJsonReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  const summary = collectImageLinksSummary(inScope);
  const details = collectImageHandoffDetails(inScope);
  return JSON.stringify(imageHandoffJsonPayload(summary, scope, details), null, 2);
}

function imageHandoffRiskLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const riskTotal = summary.missingLinked + summary.notEmbeddableLinked + summary.unknownSource;
  const status = riskTotal === 0 ? 'ready' : 'needs review';
  return [
    `# AnchorWorks Image Handoff Report (${scope})`,
    `Status: ${status} · ${riskTotal} risk(s)`,
    `Images: ${summary.total} total · ${summary.linked} linked · ${summary.embedded} embedded`,
    `Link state: ${summary.missingLinked} missing · ${summary.notEmbeddableLinked} not embeddable · ${summary.unknownSource} unknown source`,
    imageHandoffSeveritySummary(details),
    `Actions: ${summary.embeddable} embeddable · ${summary.restorable} restorable embedded link(s)`,
    ...imageHandoffDetailLines(details),
    riskTotal === 0
      ? 'Package handoff: no missing, unknown-source, or not-embeddable placed images detected.'
      : 'Package handoff: select image handoff risks, relink missing/unknown assets, and embed or replace not-embeddable linked images before collect/package.',
  ];
}

export function imageHandoffReport(): string {
  return imageHandoffRiskLines(imageLinksSummary(), 'Document', collectImageHandoffDetails()).join('\n');
}

export function imageHandoffTsvReport(): string {
  return imageHandoffTsvRows(collectImageHandoffDetails()).join('\n');
}

export function imageHandoffJsonReport(): string {
  return imageHandoffJsonReportForScope('Document');
}

export function imageHandoffSourceManifest(): string {
  return imageHandoffManifestReportForScope('Document');
}

export function imageHandoffCollectScript(): string {
  return imageHandoffCollectScriptForScope('Document');
}

export function imageHandoffCollectPowerShell(): string {
  return imageHandoffCollectPowerShellForScope('Document');
}

export function imageHandoffVerifyScript(): string {
  return imageHandoffVerifyScriptForScope('Document');
}

export function imageHandoffPackageChecklist(): string {
  return imageHandoffPackageChecklistForScope('Document');
}

export function imageHandoffPackageBlockers(): string {
  return imageHandoffPackageBlockersForScope('Document');
}

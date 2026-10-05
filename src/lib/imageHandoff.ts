/**
 * Image handoff package / delivery-report generators — the imageHandoff*
 * family (document + active-artboard report / TSV / JSON / manifest /
 * collect-verify script builders for press-run handoff packages).
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
  emptyImageLinksSummary,
  isRestorableEmbeddedImageObject,
  isEmbeddableLinkedImageObject,
  isNotEmbeddableLinkedImageObject,
  collectImageLinksSummary,
  imageLinksSummary,
  activeArtboardObjectPredicate,
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

function imageHandoffExternalPathListLines(
  details: ImageHandoffDetail[],
  actions: Set<ImageHandoffDetail['action']>,
  emptyMessage: string,
): string[] {
  const sources = imageHandoffExternalPathList(details, actions);
  return sources.length ? sources : [emptyMessage];
}

function imageHandoffCollectSourceListLines(details: ImageHandoffDetail[]): string[] {
  return imageHandoffExternalPathListLines(
    details,
    new Set<ImageHandoffDetail['action']>([
      'embed or collect linked file',
      'collect linked file',
    ]),
    'No collectable linked image sources.',
  );
}

function imageHandoffMissingRelinkListLines(details: ImageHandoffDetail[]): string[] {
  return imageHandoffExternalPathListLines(
    details,
    new Set<ImageHandoffDetail['action']>(['relink before package']),
    'No missing linked image sources.',
  );
}

function imageHandoffCollectSourceListForScope(inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffCollectSourceListLines(collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffMissingRelinkListForScope(inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffMissingRelinkListLines(collectImageHandoffDetails(inScope)).join('\n');
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

function imageHandoffPackageGatePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const blockerCount = imageHandoffPackageRiskTotal(summary);
  return {
    scope,
    pass: blockerCount === 0,
    status: blockerCount === 0 ? 'ready' : 'blocked',
    blockerCount,
    counts: {
      missingLinked: summary.missingLinked,
      notEmbeddableLinked: summary.notEmbeddableLinked,
      unknownSource: summary.unknownSource,
    },
    blockers: imageHandoffPackageBlockerDetails(details),
  };
}

function imageHandoffPackageGateJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  const summary = collectImageLinksSummary(inScope);
  const details = collectImageHandoffDetails(inScope);
  return JSON.stringify(imageHandoffPackageGatePayload(summary, scope, details), null, 2);
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

function imageHandoffCollectDestinationRows(details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  if (destinations.length === 0) return ['No collectable linked image sources.'];
  return [
    ['Source', 'Package Path'].join('\t'),
    ...destinations.map((destination) => [
      imageHandoffTsvCell(destination.source),
      imageHandoffTsvCell(destination.packagePath),
    ].join('\t')),
  ];
}

function imageHandoffCollectDestinationManifestForScope(inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffCollectDestinationRows(collectImageHandoffDetails(inScope)).join('\n');
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

function imageHandoffVerifyPowerShellLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  return [
    '$ErrorActionPreference = "Stop"',
    '',
    '# AnchorWorks image package verify script (' + scope + ')' ,
    'param([string]$PackageDir = "AnchorWorks Package")',
    '$missing = 0',
    ...(destinations.length
      ? destinations.map((destination) => 'if (-not (Test-Path -LiteralPath (Join-Path $PackageDir ' + imageHandoffPowerShellQuote(destination.packagePath) + ') -PathType Leaf)) { Write-Output "Missing: ' + destination.packagePath + '"; $missing = 1 }')
      : ['Write-Output "No collectable linked image sources to verify."']),
    'if ($missing -eq 0) { Write-Output "Package verify passed." } else { Write-Output "Package verify failed."; exit 1 }',
  ];
}

function imageHandoffVerifyPowerShellForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffVerifyPowerShellLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}
function imageHandoffPackageReleaseGateVerifyScriptLines(scope: string): string[] {
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    '',
    '# AnchorWorks image package release gate verifier (' + scope + ')' ,
    'PACKAGE_DIR="${1:-AnchorWorks Package}"',
    'GATE="$PACKAGE_DIR/image-package-release-gate.json"',
    'if [ ! -f "$GATE" ]; then echo "Missing: image-package-release-gate.json"; exit 1; fi',
    "if grep -q '\"releaseStatus\"[[:space:]]*:[[:space:]]*\"ready\"' \"$GATE\"; then echo \"Package release gate passed.\"; else echo \"Package release gate hold: review image-package-release-gate.md and image-package-release-gate.tsv\"; exit 1; fi",
  ];
}

function imageHandoffPackageReleaseGateVerifyScriptForScope(scope: string): string {
  return imageHandoffPackageReleaseGateVerifyScriptLines(scope).join('\n');
}

function imageHandoffPackageReleaseGateVerifyPowerShellLines(scope: string): string[] {
  return [
    '$ErrorActionPreference = "Stop"',
    '',
    '# AnchorWorks image package release gate verifier (' + scope + ')' ,
    'param([string]$PackageDir = "AnchorWorks Package")',
    '$gate = Join-Path $PackageDir "image-package-release-gate.json"',
    'if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { Write-Output "Missing: image-package-release-gate.json"; exit 1 }',
    '$json = Get-Content -LiteralPath $gate -Raw | ConvertFrom-Json',
    'if ($json.releaseStatus -eq "ready") { Write-Output "Package release gate passed." } else { Write-Output "Package release gate hold: review image-package-release-gate.md and image-package-release-gate.tsv"; exit 1 }',
  ];
}

function imageHandoffPackageReleaseGateVerifyPowerShellForScope(scope: string): string {
  return imageHandoffPackageReleaseGateVerifyPowerShellLines(scope).join('\n');
}
function imageHandoffVerifyManifestPayload(scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const destinations = imageHandoffCollectDestinations(details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    expectedFileCount: destinations.length,
    files: destinations.map((destination) => ({
      packagePath: destination.packagePath,
      source: destination.source,
      expectedExists: true,
    })),
  };
}

function imageHandoffVerifyManifestJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffVerifyManifestPayload(scope, collectImageHandoffDetails(inScope)), null, 2);
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

function imageHandoffPackageReadmeLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const groups = imageHandoffPackageGroups(details);
  const destinations = imageHandoffCollectDestinations(details);
  const riskTotal = imageHandoffPackageRiskTotal(summary);
  return [
    '# AnchorWorks Image Package README (' + scope + ')',
    'Status: ' + (riskTotal === 0 ? 'ready' : 'needs review') + ' · ' + riskTotal + ' risk(s)',
    'Images: ' + summary.total + ' total · ' + summary.linked + ' linked · ' + summary.embedded + ' embedded',
    '',
    '## Package Contents',
    '- Document artwork file',
    destinations.length ? '- Links/ collected linked images' : '- Links/ no collectable linked images',
    '- Image handoff reports/checklists copied from AnchorWorks',
    '',
    '## Collect Destinations',
    ...(destinations.length
      ? destinations.map((destination) => '- ' + destination.source + ' -> ' + destination.packagePath)
      : ['- none']),
    '',
    '## Automation Files',
    '- collect-linked-images.sh / collect-linked-images.ps1 copy collectable linked images into Links/.',
    '- verify-linked-images.sh / verify-linked-images.ps1 check that expected Links files exist after collection.',
    '- image-package-verify-manifest.json lists every expected collected file for CI or handoff automation.',
    '- image-package-file-index.json lists package files, kinds, byte counts, and digests.',
    '- image-package-audit.json summarizes gate status, expected Links files, and package digests.',
    '- image-package-audit.md provides a human-readable audit summary for production review.',
    '- image-package-digests.tsv provides spreadsheet-ready package digest rows.',
    '- image-package-signoff.md provides a final designer/prepress signoff checklist.',
    '- image-package-signoff.json provides machine-readable signoff checklist and signature fields.',
    '- image-package-signoff.tsv provides spreadsheet-ready signoff checklist rows.',
    '- image-package-delivery-manifest.json summarizes package deliverables for external QA systems.',
    '- image-package-delivery-manifest.tsv provides spreadsheet-ready deliverable readiness rows.',
    '- image-package-provenance.json records source, status, and required proof for every image asset.',
    '- image-package-provenance.tsv provides spreadsheet-ready image provenance rows.',
    '- image-package-rights-manifest.md provides placed-image rights, usage, and proof review instructions.',
    '- image-package-rights-manifest.json records machine-readable image rights and license review state.',
    '- image-package-rights-manifest.tsv provides spreadsheet-ready image rights review rows.',
    '- image-package-acceptance.json records client/shop acceptance checks before handoff closeout.',
    '- image-package-acceptance.tsv provides spreadsheet-ready acceptance checklist rows.',
    '- image-package-delivery-receipt.md provides a client/shop delivery receipt for package closeout.',
    '- image-package-delivery-receipt.json records machine-readable receipt fields and pending signoffs.',
    '- image-package-delivery-receipt.tsv provides spreadsheet-ready delivery receipt rows.',
    '- image-package-release-notes.md provides client/shop release notes for package delivery.',
    '- image-package-release-notes.json records machine-readable release note sections and blockers.',
    '- image-package-release-notes.tsv provides spreadsheet-ready release note rows.',
    '- image-package-sbom.json records package bill-of-materials components for audit systems.',
    '- image-package-sbom.tsv provides spreadsheet-ready package component rows.',
    '- image-package-attestation.json records package provenance/release attestation claims.',
    '- image-package-attestation.tsv provides spreadsheet-ready attestation claim rows.',
    '- image-package-risk-register.md provides a producer/prepress triage register for package blockers and residual risks.',
    '- image-package-risk-register.json records machine-readable package risk register entries and mitigation owners.',
    '- image-package-risk-register.tsv provides spreadsheet-ready package risk rows.',
    '- image-package-verification-summary.md provides a human/CI-ready verification summary for package release readiness.',
    '- image-package-verification-summary.json records machine-readable verification checks across Links, gate, risk, SBOM, and attestation outputs.',
    '- image-package-verification-summary.tsv provides spreadsheet-ready verification check rows.',
    '- image-package-client-readme.md provides recipient-facing package opening, review, and acceptance instructions.',
    '- image-package-client-readme.json records machine-readable recipient instructions and required review artifacts.',
    '- image-package-change-log.md provides package version, revision, and handoff change history for client/shop review.',
    '- image-package-change-log.json records machine-readable package change log entries and evidence links.',
    '- image-package-change-log.tsv provides spreadsheet-ready package change log rows.',
    '- image-package-relink-map.md provides recipient-facing source-to-Links relink instructions.',
    '- image-package-relink-map.json records machine-readable relink targets for placed images.',
    '- image-package-relink-map.tsv provides spreadsheet-ready relink mapping rows.',
    '- image-package-prepress-ticket.md provides an operator-facing production ticket for prepress/package execution.',
    '- image-package-prepress-ticket.json records machine-readable production tasks, holds, and evidence files.',
    '- image-package-prepress-ticket.tsv provides spreadsheet-ready prepress task rows.',
    '- image-package-printer-intake.md provides a print-shop receiving checklist for package intake.',
    '- image-package-printer-intake.json records machine-readable print-shop intake fields, holds, and required artifacts.',
    '- image-package-printer-intake.tsv provides spreadsheet-ready print-shop intake rows.',
    '- image-package-shop-proof-checklist.md provides print-shop proof review checkpoints before production approval.',
    '- image-package-shop-proof-checklist.json records machine-readable proof approval checks, holds, and evidence files.',
    '- image-package-shop-proof-checklist.tsv provides spreadsheet-ready shop proof review rows.',
    '- image-package-production-handoff.json records machine-readable production handoff responsibilities, evidence, holds, and next actions.',
    '- image-package-production-handoff.tsv provides spreadsheet-ready production handoff rows for shop scheduling.',
    '- image-package-print-release-approval.md provides the final client/shop print-release approval form before production.',
    '- image-package-print-release-approval.json records machine-readable final approval status, approvers, blockers, and evidence.',
    '- image-package-print-release-approval.tsv provides spreadsheet-ready final print-release approval rows.',
    '- image-package-vendor-qa.md provides vendor-facing QA acceptance checks before press/vendor release.',
    '- image-package-vendor-qa.json records machine-readable vendor QA status, owners, holds, and acceptance evidence.',
    '- image-package-vendor-qa.tsv provides spreadsheet-ready vendor QA rows for supplier review.',
    '- image-package-press-run-ticket.md provides an operator-facing press run ticket for production start.',
    '- image-package-press-run-ticket.json records machine-readable press setup, approvals, holds, and run evidence.',
    '- image-package-press-run-ticket.tsv provides spreadsheet-ready press run setup rows.',
    '- image-package-postpress-inspection.md provides finished-goods inspection checks after press/postpress work.',
    '- image-package-postpress-inspection.json records machine-readable postpress inspection status, defects, holds, and release evidence.',
    '- image-package-postpress-inspection.tsv provides spreadsheet-ready postpress inspection rows.',
    '- image-package-finished-goods-release.md provides final finished-goods release and shipment readiness instructions.',
    '- image-package-finished-goods-release.json records machine-readable finished-goods release status, shipment fields, holds, and evidence.',
    '- image-package-finished-goods-release.tsv provides spreadsheet-ready finished-goods release rows.',
    '- image-package-shipment-handoff.md provides carrier/customer shipment handoff and custody instructions.',
    '- image-package-shipment-handoff.json records machine-readable shipment handoff status, tracking fields, holds, and custody evidence.',
    '- image-package-shipment-handoff.tsv provides spreadsheet-ready shipment handoff rows.',
    '- image-package-delivery-confirmation.md provides recipient delivery confirmation and exception handling instructions.',
    '- image-package-delivery-confirmation.json records machine-readable delivery confirmation status, receipt fields, holds, and evidence.',
    '- image-package-delivery-confirmation.tsv provides spreadsheet-ready delivery confirmation rows.',
    '- image-package-release-gate.json summarizes final release blockers before client/shop delivery.',
    '- image-package-release-gate.md provides a human-readable release gate decision.',
    '- image-package-release-gate.tsv provides spreadsheet-ready release gate checks.',
    '- verify-package-release-gate.sh / verify-package-release-gate.ps1 fail CI when the release gate is still on hold.',
    '- image-package-ci-manifest.json lists CI/package verification steps and required release artifacts.',
    '- image-package-github-actions.yml provides a ready-to-copy GitHub Actions package verification workflow.',
    '- image-package-gitlab-ci.yml provides a ready-to-copy GitLab CI package verification job.',
    '- image-package-azure-pipelines.yml provides a ready-to-copy Azure Pipelines package verification job.',
    '- image-package-circleci.yml provides a ready-to-copy CircleCI package verification workflow.',
    '- image-package-jenkinsfile provides a ready-to-copy Jenkins Pipeline package verification job.',
    '- image-package-bitbucket-pipelines.yml provides a ready-to-copy Bitbucket Pipelines package verification step.',
    '- image-package-buildkite.yml provides a ready-to-copy Buildkite package verification pipeline.',
    '- image-package-drone.yml provides a ready-to-copy Drone CI package verification pipeline.',
    '- image-package-teamcity.kts provides a ready-to-copy TeamCity Kotlin DSL package verification build.',
    '',
    '## Relink Before Output',
    ...(groups.missingSources.length ? groups.missingSources.map((source) => '- ' + source) : ['- none']),
    '',
    '## Manual Review',
    ...(groups.manualReview.length ? groups.manualReview.map(imageHandoffChecklistDetailLine) : ['- none']),
    '',
    '## Ready Assets',
    ...(groups.ready.length ? groups.ready.map(imageHandoffChecklistDetailLine) : ['- none']),
    '',
    riskTotal === 0
      ? 'Handoff note: package is ready after collecting the listed linked files and preserving embedded images in the document.'
      : 'Handoff note: resolve relink/manual-review items before final package delivery.',
  ];
}

function imageHandoffPackageReadmeForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageReadmeLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPackageTreeLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const destinations = imageHandoffCollectDestinations(details);
  return [
    'AnchorWorks Package (' + scope + ')/',
    '├─ Document artwork file',
    '├─ README.md',
    '├─ image-handoff-report.md',
    '├─ image-package-checklist.md',
    '├─ image-package-plan.json',
    '├─ image-package-gate.json',
    '├─ collect-linked-images.sh',
    '├─ collect-linked-images.ps1',
    '├─ verify-linked-images.sh',
    '├─ verify-linked-images.ps1',
    '├─ image-package-verify-manifest.json',
    '├─ image-package-file-index.json',
    '├─ image-package-audit.json',
    '├─ image-package-audit.md',
    '├─ image-package-digests.tsv',
    '├─ image-package-signoff.md',
    '├─ image-package-signoff.json',
    '├─ image-package-signoff.tsv',
    '├─ image-package-delivery-manifest.json',
    '├─ image-package-delivery-manifest.tsv',
    '├─ image-package-provenance.json',
    '├─ image-package-provenance.tsv',
    '├─ image-package-rights-manifest.md',
    '├─ image-package-rights-manifest.json',
    '├─ image-package-rights-manifest.tsv',
    '├─ image-package-acceptance.json',
    '├─ image-package-acceptance.tsv',
    '├─ image-package-delivery-receipt.md',
    '├─ image-package-delivery-receipt.json',
    '├─ image-package-delivery-receipt.tsv',
    '├─ image-package-release-notes.md',
    '├─ image-package-release-notes.json',
    '├─ image-package-release-notes.tsv',
    '├─ image-package-sbom.json',
    '├─ image-package-sbom.tsv',
    '├─ image-package-attestation.json',
    '├─ image-package-attestation.tsv',
    '├─ image-package-risk-register.md',
    '├─ image-package-risk-register.json',
    '├─ image-package-risk-register.tsv',
    '├─ image-package-verification-summary.md',
    '├─ image-package-verification-summary.json',
    '├─ image-package-verification-summary.tsv',
    '├─ image-package-client-readme.md',
    '├─ image-package-client-readme.json',
    '├─ image-package-change-log.md',
    '├─ image-package-change-log.json',
    '├─ image-package-change-log.tsv',
    '├─ image-package-relink-map.md',
    '├─ image-package-relink-map.json',
    '├─ image-package-relink-map.tsv',
    '├─ image-package-prepress-ticket.md',
    '├─ image-package-prepress-ticket.json',
    '├─ image-package-prepress-ticket.tsv',
    '├─ image-package-printer-intake.md',
    '├─ image-package-printer-intake.json',
    '├─ image-package-printer-intake.tsv',
    '├─ image-package-shop-proof-checklist.md',
    '├─ image-package-shop-proof-checklist.json',
    '├─ image-package-shop-proof-checklist.tsv',
    '├─ image-package-production-handoff.json',
    '├─ image-package-production-handoff.tsv',
    '├─ image-package-print-release-approval.md',
    '├─ image-package-print-release-approval.json',
    '├─ image-package-print-release-approval.tsv',
    '├─ image-package-vendor-qa.md',
    '├─ image-package-vendor-qa.json',
    '├─ image-package-vendor-qa.tsv',
    '├─ image-package-press-run-ticket.md',
    '├─ image-package-press-run-ticket.json',
    '├─ image-package-press-run-ticket.tsv',
    '├─ image-package-postpress-inspection.md',
    '├─ image-package-postpress-inspection.json',
    '├─ image-package-postpress-inspection.tsv',
    '├─ image-package-finished-goods-release.md',
    '├─ image-package-finished-goods-release.json',
    '├─ image-package-finished-goods-release.tsv',
    '├─ image-package-shipment-handoff.md',
    '├─ image-package-shipment-handoff.json',
    '├─ image-package-shipment-handoff.tsv',
    '├─ image-package-delivery-confirmation.md',
    '├─ image-package-delivery-confirmation.json',
    '├─ image-package-delivery-confirmation.tsv',
    '├─ image-package-release-gate.json',
    '├─ image-package-release-gate.md',
    '├─ image-package-release-gate.tsv',
    '├─ verify-package-release-gate.sh',
    '├─ verify-package-release-gate.ps1',
    '├─ image-package-ci-manifest.json',
    '├─ image-package-github-actions.yml',
    '├─ image-package-gitlab-ci.yml',
    '├─ image-package-azure-pipelines.yml',
    '├─ image-package-circleci.yml',
    '├─ image-package-jenkinsfile',
    '├─ image-package-bitbucket-pipelines.yml',
    '├─ image-package-buildkite.yml',
    '├─ image-package-drone.yml',
    '├─ image-package-teamcity.kts',
    destinations.length ? '└─ Links/' : '└─ Links/ (no collectable linked images)',
    ...destinations.map((destination, index) => (index === destinations.length - 1 ? '   └─' : '   ├─') + ' ' + destination.packagePath.replace(/^Links\//, '')),
  ];
}

function imageHandoffPackageTreeForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageTreeLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffContentDigest(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function imageHandoffPackageBundleFiles(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ path: string; kind: string; content: string }> {
  const files = [
    { path: 'README.md', kind: 'markdown', content: imageHandoffPackageReadmeLines(summary, scope, details).join('\n') },
    { path: 'image-package-tree.txt', kind: 'text', content: imageHandoffPackageTreeLines(scope, details).join('\n') },
    { path: 'image-handoff-report.md', kind: 'markdown', content: imageHandoffRiskLines(summary, scope, details).join('\n') },
    { path: 'image-package-checklist.md', kind: 'markdown', content: imageHandoffPackageChecklistLines(summary, scope, details).join('\n') },
    { path: 'image-package-plan.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePlanPayload(summary, scope, details), null, 2) },
    { path: 'image-package-gate.json', kind: 'json', content: JSON.stringify(imageHandoffPackageGatePayload(summary, scope, details), null, 2) },
    { path: 'collect-linked-images.sh', kind: 'shell', content: imageHandoffCollectScriptLines(scope, details).join('\n') },
    { path: 'collect-linked-images.ps1', kind: 'powershell', content: imageHandoffCollectPowerShellLines(scope, details).join('\n') },
    { path: 'verify-linked-images.sh', kind: 'shell', content: imageHandoffVerifyScriptLines(scope, details).join('\n') },
    { path: 'verify-linked-images.ps1', kind: 'powershell', content: imageHandoffVerifyPowerShellLines(scope, details).join('\n') },
    { path: 'image-package-verify-manifest.json', kind: 'json', content: JSON.stringify(imageHandoffVerifyManifestPayload(scope, details), null, 2) },
    { path: 'image-collect-destinations.tsv', kind: 'tsv', content: imageHandoffCollectDestinationRows(details).join('\n') },
    { path: 'image-source-manifest.md', kind: 'markdown', content: imageHandoffManifestLines(scope, details).join('\n') },
    { path: 'image-package-signoff.md', kind: 'markdown', content: imageHandoffPackageSignoffLines(summary, scope, details).join('\n') },
    { path: 'image-package-signoff.json', kind: 'json', content: JSON.stringify(imageHandoffPackageSignoffPayload(summary, scope, details), null, 2) },
    { path: 'image-package-signoff.tsv', kind: 'tsv', content: imageHandoffPackageSignoffRows(summary, scope, details).join('\n') },
    { path: 'image-package-delivery-manifest.json', kind: 'json', content: JSON.stringify(imageHandoffPackageDeliveryManifestPayload(summary, scope, details), null, 2) },
    { path: 'image-package-delivery-manifest.tsv', kind: 'tsv', content: imageHandoffPackageDeliveryManifestRows(summary, scope, details).join('\n') },
    { path: 'image-package-provenance.json', kind: 'json', content: JSON.stringify(imageHandoffPackageProvenancePayload(scope, details), null, 2) },
    { path: 'image-package-provenance.tsv', kind: 'tsv', content: imageHandoffPackageProvenanceRows(scope, details).join('\n') },
    { path: 'image-package-rights-manifest.md', kind: 'markdown', content: imageHandoffPackageRightsManifestLines(scope, details).join('\n') },
    { path: 'image-package-rights-manifest.json', kind: 'json', content: JSON.stringify(imageHandoffPackageRightsManifestPayload(scope, details), null, 2) },
    { path: 'image-package-rights-manifest.tsv', kind: 'tsv', content: imageHandoffPackageRightsManifestRows(scope, details).join('\n') },
    { path: 'image-package-acceptance.json', kind: 'json', content: JSON.stringify(imageHandoffPackageAcceptancePayload(summary, scope, details), null, 2) },
    { path: 'image-package-acceptance.tsv', kind: 'tsv', content: imageHandoffPackageAcceptanceRows(summary, scope, details).join('\n') },
    { path: 'image-package-delivery-receipt.md', kind: 'markdown', content: imageHandoffPackageDeliveryReceiptLines(summary, scope, details).join('\n') },
    { path: 'image-package-delivery-receipt.json', kind: 'json', content: JSON.stringify(imageHandoffPackageDeliveryReceiptPayload(summary, scope, details), null, 2) },
    { path: 'image-package-delivery-receipt.tsv', kind: 'tsv', content: imageHandoffPackageDeliveryReceiptRows(summary, scope, details).join('\n') },
    { path: 'image-package-release-notes.md', kind: 'markdown', content: imageHandoffPackageReleaseNotesLines(summary, scope, details).join('\n') },
    { path: 'image-package-release-notes.json', kind: 'json', content: JSON.stringify(imageHandoffPackageReleaseNotesPayload(summary, scope, details), null, 2) },
    { path: 'image-package-release-notes.tsv', kind: 'tsv', content: imageHandoffPackageReleaseNotesRows(summary, scope, details).join('\n') },
    { path: 'image-package-sbom.json', kind: 'json', content: JSON.stringify(imageHandoffPackageSbomPayload(scope, details), null, 2) },
    { path: 'image-package-sbom.tsv', kind: 'tsv', content: imageHandoffPackageSbomRows(scope, details).join('\n') },
    { path: 'image-package-attestation.json', kind: 'json', content: JSON.stringify(imageHandoffPackageAttestationPayload(summary, scope, details), null, 2) },
    { path: 'image-package-attestation.tsv', kind: 'tsv', content: imageHandoffPackageAttestationRows(summary, scope, details).join('\n') },
    { path: 'image-package-risk-register.md', kind: 'markdown', content: imageHandoffPackageRiskRegisterLines(summary, scope, details).join('\n') },
    { path: 'image-package-risk-register.json', kind: 'json', content: JSON.stringify(imageHandoffPackageRiskRegisterPayload(summary, scope, details), null, 2) },
    { path: 'image-package-risk-register.tsv', kind: 'tsv', content: imageHandoffPackageRiskRegisterRows(summary, scope, details).join('\n') },
    { path: 'image-package-verification-summary.md', kind: 'markdown', content: imageHandoffPackageVerificationSummaryLines(summary, scope, details).join('\n') },
    { path: 'image-package-verification-summary.json', kind: 'json', content: JSON.stringify(imageHandoffPackageVerificationSummaryPayload(summary, scope, details), null, 2) },
    { path: 'image-package-verification-summary.tsv', kind: 'tsv', content: imageHandoffPackageVerificationSummaryRows(summary, scope, details).join('\n') },
    { path: 'image-package-client-readme.md', kind: 'markdown', content: imageHandoffPackageClientReadmeLines(summary, scope, details).join('\n') },
    { path: 'image-package-client-readme.json', kind: 'json', content: JSON.stringify(imageHandoffPackageClientReadmePayload(summary, scope, details), null, 2) },
    { path: 'image-package-change-log.md', kind: 'markdown', content: imageHandoffPackageChangeLogLines(summary, scope, details).join('\n') },
    { path: 'image-package-change-log.json', kind: 'json', content: JSON.stringify(imageHandoffPackageChangeLogPayload(summary, scope, details), null, 2) },
    { path: 'image-package-change-log.tsv', kind: 'tsv', content: imageHandoffPackageChangeLogRows(summary, scope, details).join('\n') },
    { path: 'image-package-relink-map.md', kind: 'markdown', content: imageHandoffPackageRelinkMapLines(scope, details).join('\n') },
    { path: 'image-package-relink-map.json', kind: 'json', content: JSON.stringify(imageHandoffPackageRelinkMapPayload(scope, details), null, 2) },
    { path: 'image-package-relink-map.tsv', kind: 'tsv', content: imageHandoffPackageRelinkMapRows(scope, details).join('\n') },
    { path: 'image-package-prepress-ticket.md', kind: 'markdown', content: imageHandoffPackagePrepressTicketLines(summary, scope, details).join('\n') },
    { path: 'image-package-prepress-ticket.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePrepressTicketPayload(summary, scope, details), null, 2) },
    { path: 'image-package-prepress-ticket.tsv', kind: 'tsv', content: imageHandoffPackagePrepressTicketRows(summary, scope, details).join('\n') },
    { path: 'image-package-printer-intake.md', kind: 'markdown', content: imageHandoffPackagePrinterIntakeLines(summary, scope, details).join('\n') },
    { path: 'image-package-printer-intake.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePrinterIntakePayload(summary, scope, details), null, 2) },
    { path: 'image-package-printer-intake.tsv', kind: 'tsv', content: imageHandoffPackagePrinterIntakeRows(summary, scope, details).join('\n') },
    { path: 'image-package-shop-proof-checklist.md', kind: 'markdown', content: imageHandoffPackageShopProofChecklistLines(summary, scope, details).join('\n') },
    { path: 'image-package-shop-proof-checklist.json', kind: 'json', content: JSON.stringify(imageHandoffPackageShopProofChecklistPayload(summary, scope, details), null, 2) },
    { path: 'image-package-shop-proof-checklist.tsv', kind: 'tsv', content: imageHandoffPackageShopProofChecklistRows(summary, scope, details).join('\n') },
    { path: 'image-package-production-handoff.json', kind: 'json', content: JSON.stringify(imageHandoffPackageProductionHandoffPayload(summary, scope, details), null, 2) },
    { path: 'image-package-production-handoff.tsv', kind: 'tsv', content: imageHandoffPackageProductionHandoffRows(summary, scope, details).join('\n') },
    { path: 'image-package-print-release-approval.md', kind: 'markdown', content: imageHandoffPackagePrintReleaseApprovalLines(summary, scope, details).join('\n') },
    { path: 'image-package-print-release-approval.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePrintReleaseApprovalPayload(summary, scope, details), null, 2) },
    { path: 'image-package-print-release-approval.tsv', kind: 'tsv', content: imageHandoffPackagePrintReleaseApprovalRows(summary, scope, details).join('\n') },
    { path: 'image-package-vendor-qa.md', kind: 'markdown', content: imageHandoffPackageVendorQaLines(summary, scope, details).join('\n') },
    { path: 'image-package-vendor-qa.json', kind: 'json', content: JSON.stringify(imageHandoffPackageVendorQaPayload(summary, scope, details), null, 2) },
    { path: 'image-package-vendor-qa.tsv', kind: 'tsv', content: imageHandoffPackageVendorQaRows(summary, scope, details).join('\n') },
    { path: 'image-package-press-run-ticket.md', kind: 'markdown', content: imageHandoffPackagePressRunTicketLines(summary, scope, details).join('\n') },
    { path: 'image-package-press-run-ticket.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePressRunTicketPayload(summary, scope, details), null, 2) },
    { path: 'image-package-press-run-ticket.tsv', kind: 'tsv', content: imageHandoffPackagePressRunTicketRows(summary, scope, details).join('\n') },
    { path: 'image-package-postpress-inspection.md', kind: 'markdown', content: imageHandoffPackagePostpressInspectionLines(summary, scope, details).join('\n') },
    { path: 'image-package-postpress-inspection.json', kind: 'json', content: JSON.stringify(imageHandoffPackagePostpressInspectionPayload(summary, scope, details), null, 2) },
    { path: 'image-package-postpress-inspection.tsv', kind: 'tsv', content: imageHandoffPackagePostpressInspectionRows(summary, scope, details).join('\n') },
    { path: 'image-package-finished-goods-release.md', kind: 'markdown', content: imageHandoffPackageFinishedGoodsReleaseLines(summary, scope, details).join('\n') },
    { path: 'image-package-finished-goods-release.json', kind: 'json', content: JSON.stringify(imageHandoffPackageFinishedGoodsReleasePayload(summary, scope, details), null, 2) },
    { path: 'image-package-finished-goods-release.tsv', kind: 'tsv', content: imageHandoffPackageFinishedGoodsReleaseRows(summary, scope, details).join('\n') },
    { path: 'image-package-shipment-handoff.md', kind: 'markdown', content: imageHandoffPackageShipmentHandoffLines(summary, scope, details).join('\n') },
    { path: 'image-package-shipment-handoff.json', kind: 'json', content: JSON.stringify(imageHandoffPackageShipmentHandoffPayload(summary, scope, details), null, 2) },
    { path: 'image-package-shipment-handoff.tsv', kind: 'tsv', content: imageHandoffPackageShipmentHandoffRows(summary, scope, details).join('\n') },
    { path: 'image-package-delivery-confirmation.md', kind: 'markdown', content: imageHandoffPackageDeliveryConfirmationLines(summary, scope, details).join('\n') },
    { path: 'image-package-delivery-confirmation.json', kind: 'json', content: JSON.stringify(imageHandoffPackageDeliveryConfirmationPayload(summary, scope, details), null, 2) },
    { path: 'image-package-delivery-confirmation.tsv', kind: 'tsv', content: imageHandoffPackageDeliveryConfirmationRows(summary, scope, details).join('\n') },
    { path: 'image-package-release-gate.json', kind: 'json', content: JSON.stringify(imageHandoffPackageReleaseGatePayload(summary, scope, details), null, 2) },
    { path: 'image-package-release-gate.md', kind: 'markdown', content: imageHandoffPackageReleaseGateLines(summary, scope, details).join('\n') },
    { path: 'image-package-release-gate.tsv', kind: 'tsv', content: imageHandoffPackageReleaseGateRows(summary, scope, details).join('\n') },
    { path: 'verify-package-release-gate.sh', kind: 'shell', content: imageHandoffPackageReleaseGateVerifyScriptLines(scope).join('\n') },
    { path: 'verify-package-release-gate.ps1', kind: 'powershell', content: imageHandoffPackageReleaseGateVerifyPowerShellLines(scope).join('\n') },
    { path: 'image-package-ci-manifest.json', kind: 'json', content: JSON.stringify(imageHandoffPackageCiManifestPayload(summary, scope, details), null, 2) },
    { path: 'image-package-github-actions.yml', kind: 'yaml', content: imageHandoffPackageGithubActionsLines(scope).join('\n') },
    { path: 'image-package-gitlab-ci.yml', kind: 'yaml', content: imageHandoffPackageGitlabCiLines(scope).join('\n') },
    { path: 'image-package-azure-pipelines.yml', kind: 'yaml', content: imageHandoffPackageAzurePipelinesLines(scope).join('\n') },
    { path: 'image-package-circleci.yml', kind: 'yaml', content: imageHandoffPackageCircleCiLines(scope).join('\n') },
    { path: 'image-package-jenkinsfile', kind: 'groovy', content: imageHandoffPackageJenkinsfileLines(scope).join('\n') },
    { path: 'image-package-bitbucket-pipelines.yml', kind: 'yaml', content: imageHandoffPackageBitbucketPipelinesLines(scope).join('\n') },
    { path: 'image-package-buildkite.yml', kind: 'yaml', content: imageHandoffPackageBuildkiteLines(scope).join('\n') },
    { path: 'image-package-drone.yml', kind: 'yaml', content: imageHandoffPackageDroneLines(scope).join('\n') },
    { path: 'image-package-teamcity.kts', kind: 'kotlin', content: imageHandoffPackageTeamCityLines(scope).join('\n') },
  ];
  const fileIndex = {
    scope,
    generatedBy: 'AnchorWorks',
    fileCount: files.length + 4,
    files: [
      ...files.map((entry) => ({ path: entry.path, kind: entry.kind, bytes: entry.content.length, digest: imageHandoffContentDigest(entry.content) })),
      { path: 'image-package-file-index.json', kind: 'json', bytes: 0, digest: '00000000' },
      { path: 'image-package-audit.json', kind: 'json', bytes: 0, digest: '00000000' },
      { path: 'image-package-audit.md', kind: 'markdown', bytes: 0, digest: '00000000' },
      { path: 'image-package-digests.tsv', kind: 'tsv', bytes: 0, digest: '00000000' },
    ],
  };
  const fileIndexEntry = fileIndex.files.length - 4;
  const auditJsonEntry = fileIndex.files.length - 3;
  const auditReportEntry = fileIndex.files.length - 2;
  const digestTsvEntry = fileIndex.files.length - 1;
  const fileIndexContent = JSON.stringify(fileIndex, null, 2);
  fileIndex.files[fileIndexEntry] = { path: 'image-package-file-index.json', kind: 'json', bytes: fileIndexContent.length, digest: imageHandoffContentDigest(fileIndexContent) };
  const audit = {
    scope,
    generatedBy: 'AnchorWorks',
    gate: imageHandoffPackageGatePayload(summary, scope, details),
    expectedLinks: imageHandoffVerifyManifestPayload(scope, details),
    packageFileCount: fileIndex.fileCount,
    packageDigests: fileIndex.files,
  };
  const auditContent = JSON.stringify(audit, null, 2);
  fileIndex.files[auditJsonEntry] = { path: 'image-package-audit.json', kind: 'json', bytes: auditContent.length, digest: imageHandoffContentDigest(auditContent) };
  audit.packageDigests = fileIndex.files;
  const auditReportContent = imageHandoffPackageAuditLinesFromAudit(scope, audit).join('\n');
  fileIndex.files[auditReportEntry] = { path: 'image-package-audit.md', kind: 'markdown', bytes: auditReportContent.length, digest: imageHandoffContentDigest(auditReportContent) };
  const digestRowsContent = imageHandoffPackageDigestRowsFromDigests(fileIndex.files).join('\n');
  fileIndex.files[digestTsvEntry] = { path: 'image-package-digests.tsv', kind: 'tsv', bytes: digestRowsContent.length, digest: imageHandoffContentDigest(digestRowsContent) };
  audit.packageDigests = fileIndex.files;
  return [
    ...files,
    { path: 'image-package-file-index.json', kind: 'json', content: JSON.stringify(fileIndex, null, 2) },
    { path: 'image-package-audit.json', kind: 'json', content: JSON.stringify(audit, null, 2) },
    { path: 'image-package-audit.md', kind: 'markdown', content: auditReportContent },
    { path: 'image-package-digests.tsv', kind: 'tsv', content: digestRowsContent },
  ];
}

function imageHandoffPackageFileIndexJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageBundleFiles(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).find((file) => file.path === 'image-package-file-index.json')?.content ?? '{}';
}

function imageHandoffPackageAuditPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const gate = imageHandoffPackageGatePayload(summary, scope, details);
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details);
  const packageFiles = imageHandoffPackageBundleFiles(summary, scope, details);
  const fileIndex = JSON.parse(packageFiles.find((file) => file.path === 'image-package-file-index.json')?.content ?? '{}');
  return {
    scope,
    generatedBy: 'AnchorWorks',
    gate,
    expectedLinks: verifyManifest,
    packageFileCount: fileIndex.fileCount ?? packageFiles.length,
    packageDigests: fileIndex.files ?? [],
  };
}

function imageHandoffPackageAuditJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageAuditPayload(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ), null, 2);
}
function imageHandoffPackageAuditLinesFromAudit(scope: string, audit: { gate: { status?: string; blockerCount?: number }; expectedLinks: { expectedFileCount?: number }; packageFileCount?: number; packageDigests?: Array<{ path: string; kind: string; bytes: number; digest: string }> }): string[] {
  const packageDigests = audit.packageDigests ?? [];
  return [
    '# AnchorWorks Image Package Audit (' + scope + ')',
    'Gate: ' + (audit.gate.status ?? 'unknown') + ' · ' + (audit.gate.blockerCount ?? 0) + ' blocker(s)',
    'Expected Links files: ' + (audit.expectedLinks.expectedFileCount ?? 0),
    'Package files: ' + (audit.packageFileCount ?? packageDigests.length),
    '',
    '## File Digests',
    ...(packageDigests.length ? packageDigests.map((file) => '- ' + file.path + ' · ' + file.kind + ' · ' + file.bytes + ' bytes · ' + file.digest) : ['- none']),
    '',
    (audit.gate.status === 'ready') ? 'Audit note: package gate is ready; verify collected Links files before delivery.' : 'Audit note: resolve package gate blockers before delivery.',
  ];
}

function imageHandoffPackageAuditLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  return imageHandoffPackageAuditLinesFromAudit(
    scope,
    imageHandoffPackageAuditPayload(summary, scope, details) as { gate: { status?: string; blockerCount?: number }; expectedLinks: { expectedFileCount?: number }; packageFileCount?: number; packageDigests?: Array<{ path: string; kind: string; bytes: number; digest: string }> },
  );
}

function imageHandoffPackageAuditReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageAuditLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}
function imageHandoffPackageDeliveryManifestPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const gate = imageHandoffPackageGatePayload(summary, scope, details) as { pass?: boolean; status?: string; blockerCount?: number };
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  const groups = imageHandoffPackageGroups(details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    gateStatus: gate.status ?? 'unknown',
    readyForDelivery: gate.pass === true,
    blockerCount: gate.blockerCount ?? imageHandoffPackageRiskTotal(summary),
    expectedLinksFileCount: verifyManifest.expectedFileCount ?? 0,
    deliverables: [
      { name: 'Document artwork file', type: 'artwork', required: true, ready: true, note: 'Include the final AnchorWorks artwork file.' },
      { name: 'Links/', type: 'asset-folder', required: (verifyManifest.expectedFileCount ?? 0) > 0, ready: groups.missingSources.length === 0, note: (verifyManifest.expectedFileCount ?? 0) + ' expected collected linked file(s).' },
      { name: 'README.md', type: 'report', required: true, ready: true, note: 'Package overview and operator instructions.' },
      { name: 'image-package-gate.json', type: 'automation', required: true, ready: gate.pass === true, note: 'Machine-readable package pass/block status.' },
      { name: 'image-package-audit.json', type: 'automation', required: true, ready: true, note: 'Package digest and expected Links audit.' },
      { name: 'image-package-digests.tsv', type: 'spreadsheet', required: true, ready: true, note: 'Spreadsheet-ready package file digests.' },
      { name: 'image-package-signoff.md', type: 'signoff', required: true, ready: false, note: 'Designer/prepress signoff must be completed before release.' },
      { name: 'image-package-signoff.tsv', type: 'spreadsheet', required: true, ready: false, note: 'Spreadsheet-ready signoff checklist rows.' },
    ],
  };
}

function imageHandoffPackageDeliveryManifestJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageDeliveryManifestPayload(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ), null, 2);
}

function imageHandoffPackageDeliveryManifestRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as {
    deliverables?: Array<{ name?: string; type?: string; required?: boolean; ready?: boolean; note?: string }>;
  };
  return [
    'Scope\tDeliverable\tType\tRequired\tReady\tNote',
    ...(payload.deliverables ?? []).map((item) => [
      imageHandoffTsvCell(scope),
      imageHandoffTsvCell(item.name ?? ''),
      imageHandoffTsvCell(item.type ?? ''),
      String(item.required ?? false),
      String(item.ready ?? false),
      imageHandoffTsvCell(item.note ?? ''),
    ].join('\t')),
  ];
}

function imageHandoffPackageDeliveryManifestTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDeliveryManifestRows(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPackageProvenanceProof(detail: ImageHandoffDetail): string {
  if (detail.status === 'linked' || detail.status === 'embeddable linked') return 'Collected source file and package path verified.';
  if (detail.status === 'missing linked') return 'Relink source before release and record replacement proof.';
  if (detail.status === 'not embeddable') return 'Provide manual source replacement or embed proof before release.';
  if (detail.status === 'unknown source') return 'Confirm embedded provenance or relink to a traceable source.';
  if (detail.status === 'restorable embedded') return 'Original external link retained for restore workflow.';
  return 'Embedded in document; preserve document as source of record.';
}

function imageHandoffPackageProvenancePayload(scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  return {
    scope,
    generatedBy: 'AnchorWorks',
    assetCount: details.length,
    traceableCount: details.filter((detail) => detail.source !== '(unknown source)' && detail.status !== 'unknown source').length,
    unresolvedCount: details.filter((detail) => detail.severity === 'error' || detail.status === 'unknown source').length,
    assets: details.map((detail) => ({
      index: detail.index,
      name: detail.name,
      source: detail.source,
      status: detail.status,
      severity: detail.severity,
      action: detail.action,
      pixels: detail.pixels,
      effectivePpi: detail.effectivePpi,
      proofRequired: imageHandoffPackageProvenanceProof(detail),
    })),
  };
}

function imageHandoffPackageProvenanceRows(scope: string, details: ImageHandoffDetail[]): string[] {
  return [
    'scope\tindex\tname\tsource\tstatus\tseverity\taction\tpixels\teffectivePpi\tproofRequired',
    ...details.map((detail) => [scope, String(detail.index), detail.name, detail.source, detail.status, detail.severity, detail.action, detail.pixels, detail.effectivePpi, imageHandoffPackageProvenanceProof(detail)].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageProvenanceJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageProvenancePayload(scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageProvenanceTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageProvenanceRows(scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageRightsStatus(detail: ImageHandoffDetail): { rightsStatus: string; requiredAction: string; usageScope: string; evidence: string } {
  if (detail.status === 'missing linked') return { rightsStatus: 'blocked', requiredAction: 'Relink source and attach license proof before release.', usageScope: 'unknown until source is restored', evidence: 'image-package-risk-register.md' };
  if (detail.status === 'unknown source') return { rightsStatus: 'unverified', requiredAction: 'Confirm embedded image origin and usage rights or relink to a licensed asset.', usageScope: 'pending provenance confirmation', evidence: 'image-package-provenance.json' };
  if (detail.status === 'not embeddable') return { rightsStatus: 'review required', requiredAction: 'Provide replacement source, license, or manual embed proof before delivery.', usageScope: 'pending source replacement', evidence: 'image-package-relink-map.md' };
  if (detail.status === 'linked' || detail.status === 'embeddable linked') return { rightsStatus: 'license proof required', requiredAction: 'Keep source license or client-owned asset proof with package records.', usageScope: 'external linked image', evidence: 'image-package-relink-map.json' };
  if (detail.status === 'restorable embedded') return { rightsStatus: 'license proof required', requiredAction: 'Confirm original external source rights before restoring or replacing link.', usageScope: 'embedded image with restorable external source', evidence: 'image-package-provenance.json' };
  return { rightsStatus: 'document-contained', requiredAction: 'Confirm document-level rights cover embedded image use.', usageScope: 'embedded in artwork document', evidence: 'image-package-provenance.json' };
}

function imageHandoffPackageRightsManifestAssets(scope: string, details: ImageHandoffDetail[]): Array<Record<string, unknown>> {
  return details.map((detail) => {
    const rights = imageHandoffPackageRightsStatus(detail);
    return {
      scope,
      imageIndex: detail.index,
      name: detail.name,
      source: detail.source,
      imageStatus: detail.status,
      severity: detail.severity,
      rightsStatus: rights.rightsStatus,
      usageScope: rights.usageScope,
      requiredAction: rights.requiredAction,
      evidence: rights.evidence,
      proofRequired: imageHandoffPackageProvenanceProof(detail),
    };
  });
}

function imageHandoffPackageRightsManifestPayload(scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const assets = imageHandoffPackageRightsManifestAssets(scope, details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    manifestType: 'Image package rights manifest',
    assetCount: assets.length,
    blockedCount: assets.filter((asset) => asset.rightsStatus === 'blocked').length,
    reviewRequiredCount: assets.filter((asset) => asset.rightsStatus === 'review required' || asset.rightsStatus === 'unverified' || asset.rightsStatus === 'license proof required').length,
    documentContainedCount: assets.filter((asset) => asset.rightsStatus === 'document-contained').length,
    assets,
  };
}

function imageHandoffPackageRightsManifestRows(scope: string, details: ImageHandoffDetail[]): string[] {
  const assets = imageHandoffPackageRightsManifestAssets(scope, details);
  return [
    'Scope\tImage Index\tName\tSource\tImage Status\tSeverity\tRights Status\tUsage Scope\tRequired Action\tEvidence\tProof Required',
    ...assets.map((asset) => [scope, asset.imageIndex, asset.name, asset.source, asset.imageStatus, asset.severity, asset.rightsStatus, asset.usageScope, asset.requiredAction, asset.evidence, asset.proofRequired].map((value) => imageHandoffTsvCell(String(value ?? ''))).join('\t')),
  ];
}

function imageHandoffPackageRightsManifestLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const manifest = imageHandoffPackageRightsManifestPayload(scope, details) as { assetCount?: number; blockedCount?: number; reviewRequiredCount?: number; documentContainedCount?: number; assets: Array<Record<string, unknown>> };
  return [
    '# AnchorWorks Image Package Rights Manifest (' + scope + ')',
    'Assets: ' + (manifest.assetCount ?? 0) + ' · blocked: ' + (manifest.blockedCount ?? 0) + ' · review required: ' + (manifest.reviewRequiredCount ?? 0) + ' · document-contained: ' + (manifest.documentContainedCount ?? 0),
    '',
    '## Rights Review',
    ...(manifest.assets.length ? manifest.assets.map((asset) => '- #' + asset.imageIndex + ' ' + asset.name + ' · ' + asset.rightsStatus + ' · ' + asset.requiredAction + ' · evidence: ' + asset.evidence) : ['- none']),
    '',
    (manifest.blockedCount ?? 0) === 0 && (manifest.reviewRequiredCount ?? 0) === 0 ? 'Rights note: no additional placed-image rights review is required by this package manifest.' : 'Rights note: collect license/client-owned proof before final delivery approval.',
  ];
}

function imageHandoffPackageRightsManifestJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageRightsManifestPayload(scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageRightsManifestTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRightsManifestRows(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageRightsManifestReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRightsManifestLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageAcceptancePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const gate = imageHandoffPackageGatePayload(summary, scope, details) as { pass?: boolean; blockerCount?: number };
  const provenance = imageHandoffPackageProvenancePayload(scope, details) as { unresolvedCount?: number };
  const checks = [
    { item: 'All linked image sources are collected or embedded.', owner: 'Production', required: true, accepted: gate.pass === true, evidence: 'image-package-verify-manifest.json' },
    { item: 'Image provenance is traceable for every placed asset.', owner: 'Prepress', required: true, accepted: (provenance.unresolvedCount ?? 0) === 0, evidence: 'image-package-provenance.json' },
    { item: 'Release gate is ready for client/shop delivery.', owner: 'Producer', required: true, accepted: gate.pass === true, evidence: 'image-package-release-gate.json' },
    { item: 'Designer and prepress signoff fields are completed.', owner: 'Designer/Prepress', required: true, accepted: false, evidence: 'image-package-signoff.md' },
    { item: 'Client/shop recipient has accepted package contents.', owner: 'Client/Shop', required: true, accepted: false, evidence: 'Recipient name/date required' },
  ];
  return {
    scope,
    generatedBy: 'AnchorWorks',
    acceptanceStatus: checks.every((check) => check.accepted) ? 'accepted' : 'pending',
    pendingCount: checks.filter((check) => !check.accepted).length,
    blockerCount: gate.blockerCount ?? 0,
    checks,
    signatures: { recipient: { name: '', role: '', date: '' }, producer: { name: '', date: '' } },
  };
}

function imageHandoffPackageAcceptanceRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageAcceptancePayload(summary, scope, details) as { checks: Array<{ item: string; owner: string; required: boolean; accepted: boolean; evidence: string }> };
  return [
    'Scope\tItem\tOwner\tRequired\tAccepted\tEvidence',
    ...payload.checks.map((check) => [scope, check.item, check.owner, String(check.required), String(check.accepted), check.evidence].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageAcceptanceJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageAcceptancePayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageAcceptanceTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageAcceptanceRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageDeliveryReceiptPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const delivery = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; deliverables?: Array<{ name?: string; required?: boolean; ready?: boolean }> };
  const acceptance = imageHandoffPackageAcceptancePayload(summary, scope, details) as { acceptanceStatus?: string; pendingCount?: number; checks?: Array<{ item?: string; accepted?: boolean }> };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return {
    scope,
    generatedBy: 'AnchorWorks',
    receiptStatus: acceptance.acceptanceStatus === 'accepted' && releaseGate.releaseStatus === 'ready' ? 'ready for recipient signature' : 'pending',
    deliveryReady: delivery.readyForDelivery === true,
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    pendingAcceptanceCount: acceptance.pendingCount ?? 0,
    holdCount: releaseGate.holdCount ?? 0,
    deliveredArtifacts: (delivery.deliverables ?? []).map((item) => ({ name: item.name ?? 'Unnamed deliverable', required: item.required === true, ready: item.ready === true })),
    pendingItems: (acceptance.checks ?? []).filter((check) => check.accepted !== true).map((check) => check.item ?? 'Unnamed acceptance item'),
    receiptFields: { deliveredTo: '', deliveredBy: '', deliveryDate: '', packageLocation: '', notes: '' },
  };
}

function imageHandoffPackageDeliveryReceiptRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const receipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus: string; deliveryReady: boolean; releaseStatus: string; pendingAcceptanceCount: number; holdCount: number; pendingItems: string[] };
  return [
    'Scope\tField\tValue',
    [scope, 'Receipt status', receipt.receiptStatus].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Delivery ready', String(receipt.deliveryReady)].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Release status', receipt.releaseStatus].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Pending acceptance count', String(receipt.pendingAcceptanceCount)].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Hold count', String(receipt.holdCount)].map(imageHandoffTsvCell).join('\t'),
    ...receipt.pendingItems.map((item) => [scope, 'Pending item', item].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageDeliveryReceiptLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const receipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus: string; releaseStatus: string; deliveryReady: boolean; pendingAcceptanceCount: number; pendingItems: string[] };
  return [
    '# AnchorWorks Image Package Delivery Receipt (' + scope + ')',
    'Receipt status: ' + receipt.receiptStatus,
    'Release status: ' + receipt.releaseStatus,
    'Delivery ready: ' + String(receipt.deliveryReady),
    'Pending acceptance items: ' + receipt.pendingAcceptanceCount,
    '',
    '## Recipient',
    '- Delivered to:',
    '- Delivered by:',
    '- Delivery date:',
    '- Package location:',
    '',
    '## Pending Items',
    ...(receipt.pendingItems.length ? receipt.pendingItems.map((item) => '- ' + item) : ['- none']),
    '',
    '## Receipt Note',
    'Recipient signature should be completed after release gate, acceptance checklist, and package contents are reviewed.',
  ];
}

function imageHandoffPackageDeliveryReceiptReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDeliveryReceiptLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageDeliveryReceiptJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageDeliveryReceiptPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageDeliveryReceiptTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDeliveryReceiptRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageReleaseNotesPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number; blockers?: string[] };
  const receipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus?: string; pendingItems?: string[] };
  const collectDestinations = imageHandoffCollectDestinations(details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    receiptStatus: receipt.receiptStatus ?? 'pending',
    holdCount: releaseGate.holdCount ?? 0,
    totalImages: summary.total,
    linkedImages: summary.linked,
    embeddedImages: summary.embedded,
    expectedCollectedLinks: collectDestinations.length,
    highlights: [
      'Package contains artwork file, Links folder, verification scripts, manifests, release gate, and receipt artifacts.',
      'Run verify-linked-images and verify-package-release-gate before external delivery.',
      'Keep README, provenance, acceptance, and delivery receipt with the delivered package.',
    ],
    blockers: releaseGate.blockers ?? [],
    pendingItems: receipt.pendingItems ?? [],
  };
}

function imageHandoffPackageReleaseNotesRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const notes = imageHandoffPackageReleaseNotesPayload(summary, scope, details) as { releaseStatus: string; receiptStatus: string; totalImages: number; expectedCollectedLinks: number; highlights: string[]; blockers: string[]; pendingItems: string[] };
  return [
    'Scope\tSection\tValue',
    [scope, 'Release status', notes.releaseStatus].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Receipt status', notes.receiptStatus].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Total images', String(notes.totalImages)].map(imageHandoffTsvCell).join('\t'),
    [scope, 'Expected collected Links', String(notes.expectedCollectedLinks)].map(imageHandoffTsvCell).join('\t'),
    ...notes.highlights.map((item) => [scope, 'Highlight', item].map(imageHandoffTsvCell).join('\t')),
    ...notes.blockers.map((item) => [scope, 'Blocker', item].map(imageHandoffTsvCell).join('\t')),
    ...notes.pendingItems.map((item) => [scope, 'Pending item', item].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageReleaseNotesLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const notes = imageHandoffPackageReleaseNotesPayload(summary, scope, details) as { releaseStatus: string; receiptStatus: string; totalImages: number; linkedImages: number; embeddedImages: number; expectedCollectedLinks: number; highlights: string[]; blockers: string[]; pendingItems: string[] };
  return [
    '# AnchorWorks Image Package Release Notes (' + scope + ')',
    'Release status: ' + notes.releaseStatus,
    'Receipt status: ' + notes.receiptStatus,
    'Images: ' + notes.totalImages + ' total · ' + notes.linkedImages + ' linked · ' + notes.embeddedImages + ' embedded',
    'Expected collected Links: ' + notes.expectedCollectedLinks,
    '',
    '## Highlights',
    ...notes.highlights.map((item) => '- ' + item),
    '',
    '## Blockers',
    ...(notes.blockers.length ? notes.blockers.map((item) => '- ' + item) : ['- none']),
    '',
    '## Pending Closeout Items',
    ...(notes.pendingItems.length ? notes.pendingItems.map((item) => '- ' + item) : ['- none']),
  ];
}

function imageHandoffPackageReleaseNotesReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageReleaseNotesLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageReleaseNotesJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageReleaseNotesPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageReleaseNotesTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageReleaseNotesRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageSbomComponentType(detail: ImageHandoffDetail): string {
  if (detail.status === 'embedded' || detail.status === 'restorable embedded') return 'embedded-image';
  if (detail.status === 'missing linked' || detail.status === 'not embeddable' || detail.status === 'embeddable linked' || detail.status === 'linked') return 'linked-image';
  return 'image-provenance-review';
}

function imageHandoffPackageSbomPayload(scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const collectDestinations = new Map(imageHandoffCollectDestinations(details).map((destination) => [destination.source, destination.packagePath]));
  const components = details.map((detail) => ({
    bomRef: 'image-' + detail.index,
    type: imageHandoffPackageSbomComponentType(detail),
    name: detail.name,
    source: detail.source,
    packagePath: collectDestinations.get(detail.source) ?? '',
    status: detail.status,
    action: detail.action,
    pixels: detail.pixels,
    effectivePpi: detail.effectivePpi,
  }));
  return {
    bomFormat: 'AnchorWorks Image Package SBOM',
    specVersion: '1.0',
    scope,
    generatedBy: 'AnchorWorks',
    componentCount: components.length,
    linkedComponentCount: components.filter((component) => component.type === 'linked-image').length,
    embeddedComponentCount: components.filter((component) => component.type === 'embedded-image').length,
    components,
  };
}

function imageHandoffPackageSbomRows(scope: string, details: ImageHandoffDetail[]): string[] {
  const sbom = imageHandoffPackageSbomPayload(scope, details) as { components: Array<{ bomRef: string; type: string; name: string; source: string; packagePath: string; status: string; action: string; pixels: string; effectivePpi: string }> };
  return [
    'Scope\tBOM Ref\tType\tName\tSource\tPackage Path\tStatus\tAction\tPixels\tEffective PPI',
    ...sbom.components.map((component) => [scope, component.bomRef, component.type, component.name, component.source, component.packagePath, component.status, component.action, component.pixels, component.effectivePpi].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageSbomJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageSbomPayload(scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageSbomTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageSbomRows(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageAttestationPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const gate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const provenance = imageHandoffPackageProvenancePayload(scope, details) as { unresolvedCount?: number; traceableCount?: number };
  const sbom = imageHandoffPackageSbomPayload(scope, details) as { componentCount?: number };
  const claims = [
    { name: 'Package generated by AnchorWorks', subject: 'AnchorWorks Package', passed: true, evidence: 'README.md' },
    { name: 'SBOM generated for placed image components', subject: 'image-package-sbom.json', passed: (sbom.componentCount ?? 0) === details.length, evidence: 'image-package-sbom.json' },
    { name: 'Image provenance manifest generated', subject: 'image-package-provenance.json', passed: true, evidence: 'image-package-provenance.json' },
    { name: 'Release gate evaluated', subject: 'image-package-release-gate.json', passed: gate.releaseStatus === 'ready', evidence: 'image-package-release-gate.json' },
    { name: 'Package digest manifest generated', subject: 'image-package-digests.tsv', passed: true, evidence: 'image-package-digests.tsv' },
  ];
  return {
    scope,
    generatedBy: 'AnchorWorks',
    attestationType: 'AnchorWorks image package provenance',
    releaseStatus: gate.releaseStatus ?? 'hold',
    holdCount: gate.holdCount ?? 0,
    componentCount: sbom.componentCount ?? 0,
    traceableImageCount: provenance.traceableCount ?? 0,
    unresolvedProvenanceCount: provenance.unresolvedCount ?? 0,
    claims,
  };
}

function imageHandoffPackageAttestationRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const attestation = imageHandoffPackageAttestationPayload(summary, scope, details) as { claims: Array<{ name: string; subject: string; passed: boolean; evidence: string }> };
  return [
    'Scope\tClaim\tSubject\tPassed\tEvidence',
    ...attestation.claims.map((claim) => [scope, claim.name, claim.subject, String(claim.passed), claim.evidence].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageAttestationJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageAttestationPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageAttestationTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageAttestationRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageRiskRegisterEntry(detail: ImageHandoffDetail): Record<string, unknown> {
  const severityRank = detail.severity === 'error' ? 'critical' : detail.severity === 'warning' ? 'major' : detail.severity === 'info' ? 'minor' : 'accepted';
  const owner = detail.severity === 'error' ? 'prepress' : detail.severity === 'warning' ? 'producer' : detail.severity === 'info' ? 'designer' : 'none';
  const mitigation = detail.severity === 'ok' ? 'No mitigation required.' : detail.action;
  return {
    id: 'IMAGE-' + String(detail.index).padStart(3, '0'),
    name: detail.name,
    source: detail.source,
    status: detail.status,
    severity: detail.severity,
    severityRank,
    owner,
    mitigation,
    evidence: detail.source,
    packageImpact: detail.severity === 'error' ? 'blocks release' : detail.severity === 'warning' ? 'requires acceptance' : detail.severity === 'info' ? 'monitor before release' : 'none',
    pixels: detail.pixels,
    effectivePpi: detail.effectivePpi,
  };
}

function imageHandoffPackageRiskRegisterPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const entries = details.map(imageHandoffPackageRiskRegisterEntry);
  const openEntries = entries.filter((entry) => entry.severity === 'error' || entry.severity === 'warning' || entry.severity === 'info');
  return {
    scope,
    generatedBy: 'AnchorWorks',
    registerType: 'Image package risk register',
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    holdCount: releaseGate.holdCount ?? 0,
    riskTotal: imageHandoffPackageRiskTotal(summary),
    openRiskCount: openEntries.length,
    summary: {
      missingLinked: summary.missingLinked,
      notEmbeddableLinked: summary.notEmbeddableLinked,
      unknownSource: summary.unknownSource,
      linked: summary.linked,
      embedded: summary.embedded,
      total: summary.total,
    },
    entries,
  };
}

function imageHandoffPackageRiskRegisterRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const riskRegister = imageHandoffPackageRiskRegisterPayload(summary, scope, details) as { entries: Array<Record<string, unknown>> };
  return [
    'Scope	Risk ID	Name	Status	Severity	Owner	Mitigation	Package Impact	Source',
    ...riskRegister.entries.map((entry) => [scope, entry.id, entry.name, entry.status, entry.severity, entry.owner, entry.mitigation, entry.packageImpact, entry.source].map((value) => imageHandoffTsvCell(String(value ?? ''))).join('	')),
  ];
}

function imageHandoffPackageRiskRegisterLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const riskRegister = imageHandoffPackageRiskRegisterPayload(summary, scope, details) as { releaseStatus?: string; riskTotal?: number; openRiskCount?: number; entries: Array<Record<string, unknown>> };
  const entries = riskRegister.entries;
  return [
    '# AnchorWorks Image Package Risk Register (' + scope + ')',
    'Release status: ' + (riskRegister.releaseStatus ?? 'hold') + ' · ' + (riskRegister.riskTotal ?? 0) + ' package risk(s) · ' + (riskRegister.openRiskCount ?? 0) + ' open item(s)',
    '',
    '## Risk Entries',
    ...(entries.length ? entries.map((entry) => '- ' + entry.id + ' · ' + entry.severity + ' · ' + entry.name + ' · ' + entry.status + ' · ' + entry.mitigation) : ['- none']),
    '',
    (riskRegister.riskTotal ?? 0) === 0 ? 'Risk note: no blocking placed-image risks detected.' : 'Risk note: resolve or explicitly accept open risks before package release.',
  ];
}

function imageHandoffPackageRiskRegisterJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageRiskRegisterPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageRiskRegisterTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRiskRegisterRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageRiskRegisterReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRiskRegisterLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageVerificationSummaryChecks(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ name: string; status: 'pass' | 'hold'; detail: string; evidence: string }> {
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const riskRegister = imageHandoffPackageRiskRegisterPayload(summary, scope, details) as { openRiskCount?: number; riskTotal?: number };
  const sbom = imageHandoffPackageSbomPayload(scope, details) as { componentCount?: number };
  const attestation = imageHandoffPackageAttestationPayload(summary, scope, details) as { claims: Array<{ passed: boolean }> };
  const passedClaims = attestation.claims.filter((claim) => claim.passed).length;
  return [
    { name: 'Links collection manifest generated', status: 'pass', detail: (verifyManifest.expectedFileCount ?? 0) + ' expected collected Links file(s).', evidence: 'image-package-verify-manifest.json' },
    { name: 'Release gate evaluated', status: releaseGate.releaseStatus === 'ready' ? 'pass' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.json' },
    { name: 'Risk register reviewed', status: (riskRegister.riskTotal ?? 0) === 0 ? 'pass' : 'hold', detail: (riskRegister.openRiskCount ?? 0) + ' open risk item(s).', evidence: 'image-package-risk-register.json' },
    { name: 'SBOM generated', status: (sbom.componentCount ?? 0) === details.length ? 'pass' : 'hold', detail: (sbom.componentCount ?? 0) + ' image component(s).', evidence: 'image-package-sbom.json' },
    { name: 'Attestation claims captured', status: passedClaims === attestation.claims.length ? 'pass' : 'hold', detail: passedClaims + ' of ' + attestation.claims.length + ' claim(s) pass.', evidence: 'image-package-attestation.json' },
  ];
}

function imageHandoffPackageVerificationSummaryPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const checks = imageHandoffPackageVerificationSummaryChecks(summary, scope, details);
  const holdCount = checks.filter((check) => check.status === 'hold').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    summaryType: 'Image package verification summary',
    verificationStatus: holdCount === 0 ? 'pass' : 'hold',
    holdCount,
    imageCount: summary.total,
    linkedImageCount: summary.linked,
    embeddedImageCount: summary.embedded,
    checks,
  };
}

function imageHandoffPackageVerificationSummaryRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const checks = imageHandoffPackageVerificationSummaryChecks(summary, scope, details);
  return [
    'Scope	Check	Status	Detail	Evidence',
    ...checks.map((check) => [scope, check.name, check.status, check.detail, check.evidence].map(imageHandoffTsvCell).join('	')),
  ];
}

function imageHandoffPackageVerificationSummaryLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageVerificationSummaryPayload(summary, scope, details) as { verificationStatus?: string; holdCount?: number; checks: Array<{ name: string; status: string; detail: string; evidence: string }> };
  return [
    '# AnchorWorks Image Package Verification Summary (' + scope + ')',
    'Verification status: ' + (payload.verificationStatus ?? 'hold') + ' · ' + (payload.holdCount ?? 0) + ' hold(s)',
    '',
    '## Checks',
    ...payload.checks.map((check) => '- ' + check.status + ' · ' + check.name + ' · ' + check.detail + ' · evidence: ' + check.evidence),
    '',
    (payload.holdCount ?? 0) === 0 ? 'Verification note: package automation is ready for delivery review.' : 'Verification note: resolve held checks before release or CI approval.',
  ];
}

function imageHandoffPackageVerificationSummaryJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageVerificationSummaryPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageVerificationSummaryTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageVerificationSummaryRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageVerificationSummaryReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageVerificationSummaryLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageClientReadmePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const destinations = imageHandoffCollectDestinations(details);
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const verification = imageHandoffPackageVerificationSummaryPayload(summary, scope, details) as { verificationStatus?: string; holdCount?: number };
  const delivery = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; expectedLinksFileCount?: number };
  const requiredReviewArtifacts = [
    'README.md',
    'image-package-client-readme.md',
    'image-package-release-notes.md',
    'image-package-verification-summary.md',
    'image-package-release-gate.md',
    'image-package-delivery-receipt.md',
  ];
  return {
    scope,
    generatedBy: 'AnchorWorks',
    readmeType: 'Image package client README',
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    readyForDelivery: delivery.readyForDelivery === true && verification.verificationStatus === 'pass',
    releaseHoldCount: releaseGate.holdCount ?? 0,
    verificationHoldCount: verification.holdCount ?? 0,
    imageCount: summary.total,
    expectedLinksFileCount: delivery.expectedLinksFileCount ?? destinations.length,
    requiredReviewArtifacts,
    recipientSteps: [
      'Open the packaged artwork file in AnchorWorks or Illustrator-compatible review software.',
      'Keep the Links/ folder beside the artwork file before opening or relinking assets.',
      'Review image-package-release-notes.md and image-package-verification-summary.md before approval.',
      'If release status is hold, send image-package-risk-register.md back to the producer/prepress contact.',
      'Complete image-package-delivery-receipt.md after acceptance or rejection.',
    ],
    supportFiles: destinations.map((destination) => ({ packagePath: destination.packagePath, source: destination.source })),
  };
}

function imageHandoffPackageClientReadmeLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageClientReadmePayload(summary, scope, details) as { releaseStatus?: string; readyForDelivery?: boolean; expectedLinksFileCount?: number; requiredReviewArtifacts: string[]; recipientSteps: string[]; supportFiles: Array<{ packagePath: string; source: string }> };
  return [
    '# AnchorWorks Image Package Client README (' + scope + ')',
    'Delivery status: ' + (payload.readyForDelivery ? 'ready for recipient review' : 'needs producer/prepress review') + ' · release gate: ' + (payload.releaseStatus ?? 'hold'),
    'Expected linked files: ' + (payload.expectedLinksFileCount ?? 0),
    '',
    '## Recipient Steps',
    ...payload.recipientSteps.map((step, index) => String(index + 1) + '. ' + step),
    '',
    '## Review These Files',
    ...payload.requiredReviewArtifacts.map((artifact) => '- ' + artifact),
    '',
    '## Linked Assets',
    ...(payload.supportFiles.length ? payload.supportFiles.map((file) => '- ' + file.packagePath + ' from ' + file.source) : ['- none expected']),
    '',
    payload.readyForDelivery ? 'Client note: package is ready for recipient review; keep folder structure intact.' : 'Client note: package has holds; request producer/prepress clearance before final approval.',
  ];
}

function imageHandoffPackageClientReadmeJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageClientReadmePayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageClientReadmeForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageClientReadmeLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageChangeLogPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const riskRegister = imageHandoffPackageRiskRegisterPayload(summary, scope, details) as { openRiskCount?: number; riskTotal?: number };
  const verification = imageHandoffPackageVerificationSummaryPayload(summary, scope, details) as { verificationStatus?: string; holdCount?: number };
  const destinations = imageHandoffCollectDestinations(details);
  const entries = [
    { version: 'package-1', changeType: 'package generated', description: scope + ' image package generated by AnchorWorks.', status: releaseGate.releaseStatus ?? 'hold', evidence: 'README.md' },
    { version: 'package-1', changeType: 'image inventory snapshot', description: summary.total + ' image(s), ' + summary.linked + ' linked, ' + summary.embedded + ' embedded.', status: summary.total === details.length ? 'recorded' : 'review', evidence: 'image-source-manifest.md' },
    { version: 'package-1', changeType: 'links collection plan', description: destinations.length + ' linked file(s) expected in Links/.', status: destinations.length > 0 ? 'collect' : 'none', evidence: 'image-package-verify-manifest.json' },
    { version: 'package-1', changeType: 'risk register snapshot', description: (riskRegister.openRiskCount ?? 0) + ' open risk item(s), ' + (riskRegister.riskTotal ?? 0) + ' package risk(s).', status: (riskRegister.riskTotal ?? 0) === 0 ? 'clear' : 'hold', evidence: 'image-package-risk-register.md' },
    { version: 'package-1', changeType: 'verification summary', description: (verification.holdCount ?? 0) + ' held verification check(s).', status: verification.verificationStatus ?? 'hold', evidence: 'image-package-verification-summary.md' },
    { version: 'package-1', changeType: 'release gate decision', description: (releaseGate.holdCount ?? 0) + ' release hold(s).', status: releaseGate.releaseStatus ?? 'hold', evidence: 'image-package-release-gate.md' },
  ];
  return {
    scope,
    generatedBy: 'AnchorWorks',
    changeLogType: 'Image package change log',
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    changeCount: entries.length,
    entries,
  };
}

function imageHandoffPackageChangeLogRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const changeLog = imageHandoffPackageChangeLogPayload(summary, scope, details) as { entries: Array<{ version: string; changeType: string; description: string; status: string; evidence: string }> };
  return [
    'Scope	Version	Change Type	Status	Description	Evidence',
    ...changeLog.entries.map((entry) => [scope, entry.version, entry.changeType, entry.status, entry.description, entry.evidence].map(imageHandoffTsvCell).join('	')),
  ];
}

function imageHandoffPackageChangeLogLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const changeLog = imageHandoffPackageChangeLogPayload(summary, scope, details) as { releaseStatus?: string; changeCount?: number; entries: Array<{ version: string; changeType: string; description: string; status: string; evidence: string }> };
  return [
    '# AnchorWorks Image Package Change Log (' + scope + ')',
    'Release status: ' + (changeLog.releaseStatus ?? 'hold') + ' · ' + (changeLog.changeCount ?? 0) + ' change record(s)',
    '',
    '## Changes',
    ...changeLog.entries.map((entry) => '- ' + entry.version + ' · ' + entry.changeType + ' · ' + entry.status + ' · ' + entry.description + ' · evidence: ' + entry.evidence),
    '',
    'Change note: append client/shop revision requests here before regenerating or repackaging linked assets.',
  ];
}

function imageHandoffPackageChangeLogJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageChangeLogPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageChangeLogTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageChangeLogRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageChangeLogReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageChangeLogLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackageRelinkMapEntries(scope: string, details: ImageHandoffDetail[]): Array<Record<string, unknown>> {
  const destinationBySource = new Map(imageHandoffCollectDestinations(details).map((destination) => [destination.source, destination.packagePath]));
  return details.map((detail) => {
    const packagePath = destinationBySource.get(detail.source) ?? '';
    const relinkStatus = packagePath ? 'relink to packaged asset' : detail.action === 'relink before package' ? 'source missing before package' : detail.status === 'unknown source' ? 'confirm embedded provenance' : 'no relink required';
    const targetPath = packagePath || (detail.action === 'relink before package' ? '(relink source before packaging)' : '');
    return {
      imageIndex: detail.index,
      name: detail.name,
      originalSource: detail.source,
      packagePath,
      targetPath,
      relinkStatus,
      imageStatus: detail.status,
      severity: detail.severity,
      action: detail.action,
      scope,
    };
  });
}

function imageHandoffPackageRelinkMapPayload(scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const entries = imageHandoffPackageRelinkMapEntries(scope, details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    mapType: 'Image package relink map',
    imageCount: details.length,
    relinkTargetCount: entries.filter((entry) => typeof entry.packagePath === 'string' && entry.packagePath.length > 0).length,
    unresolvedRelinkCount: entries.filter((entry) => entry.relinkStatus === 'source missing before package' || entry.relinkStatus === 'confirm embedded provenance').length,
    entries,
  };
}

function imageHandoffPackageRelinkMapRows(scope: string, details: ImageHandoffDetail[]): string[] {
  const entries = imageHandoffPackageRelinkMapEntries(scope, details);
  return [
    'Scope\tImage Index\tName\tOriginal Source\tPackage Path\tTarget Path\tRelink Status\tImage Status\tSeverity\tAction',
    ...entries.map((entry) => [scope, entry.imageIndex, entry.name, entry.originalSource, entry.packagePath, entry.targetPath, entry.relinkStatus, entry.imageStatus, entry.severity, entry.action].map((value) => imageHandoffTsvCell(String(value ?? ''))).join('\t')),
  ];
}

function imageHandoffPackageRelinkMapLines(scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageRelinkMapPayload(scope, details) as { relinkTargetCount?: number; unresolvedRelinkCount?: number; entries: Array<Record<string, unknown>> };
  return [
    '# AnchorWorks Image Package Relink Map (' + scope + ')',
    'Relink targets: ' + (payload.relinkTargetCount ?? 0) + ' · unresolved: ' + (payload.unresolvedRelinkCount ?? 0),
    '',
    '## Relink Instructions',
    ...(payload.entries.length ? payload.entries.map((entry) => '- #' + entry.imageIndex + ' ' + entry.name + ' · ' + entry.relinkStatus + ' · ' + (entry.packagePath || entry.targetPath || entry.originalSource)) : ['- none']),
    '',
    (payload.unresolvedRelinkCount ?? 0) === 0 ? 'Relink note: packaged Links targets are ready for recipient relinking.' : 'Relink note: resolve missing or unknown sources before final recipient approval.',
  ];
}

function imageHandoffPackageRelinkMapJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageRelinkMapPayload(scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageRelinkMapTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRelinkMapRows(scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageRelinkMapReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageRelinkMapLines(scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackagePrepressTicketTasks(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ task: string; owner: string; status: 'ready' | 'hold' | 'review'; detail: string; evidence: string }> {
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const rightsManifest = imageHandoffPackageRightsManifestPayload(scope, details) as { blockedCount?: number; reviewRequiredCount?: number };
  const relinkMap = imageHandoffPackageRelinkMapPayload(scope, details) as { relinkTargetCount?: number; unresolvedRelinkCount?: number };
  const riskRegister = imageHandoffPackageRiskRegisterPayload(summary, scope, details) as { riskTotal?: number; openRiskCount?: number };
  return [
    { task: 'Collect linked images into Links/', owner: 'Prepress', status: (verifyManifest.expectedFileCount ?? 0) > 0 ? 'ready' : 'review', detail: (verifyManifest.expectedFileCount ?? 0) + ' expected linked file(s).', evidence: 'collect-linked-images.sh' },
    { task: 'Verify packaged Links files', owner: 'Prepress', status: (verifyManifest.expectedFileCount ?? 0) > 0 ? 'ready' : 'review', detail: 'Run verify-linked-images before release.', evidence: 'verify-linked-images.sh' },
    { task: 'Resolve relink map holds', owner: 'Producer', status: (relinkMap.unresolvedRelinkCount ?? 0) === 0 ? 'ready' : 'hold', detail: (relinkMap.unresolvedRelinkCount ?? 0) + ' unresolved relink item(s), ' + (relinkMap.relinkTargetCount ?? 0) + ' package relink target(s).', evidence: 'image-package-relink-map.md' },
    { task: 'Clear image package risks', owner: 'Producer', status: (riskRegister.riskTotal ?? 0) === 0 ? 'ready' : 'hold', detail: (riskRegister.openRiskCount ?? 0) + ' open risk item(s).', evidence: 'image-package-risk-register.md' },
    { task: 'Confirm image rights/license proof', owner: 'Producer', status: (rightsManifest.blockedCount ?? 0) === 0 && (rightsManifest.reviewRequiredCount ?? 0) === 0 ? 'ready' : 'hold', detail: (rightsManifest.blockedCount ?? 0) + ' blocked rights item(s), ' + (rightsManifest.reviewRequiredCount ?? 0) + ' review item(s).', evidence: 'image-package-rights-manifest.md' },
    { task: 'Review final release gate', owner: 'Prepress lead', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md' },
  ];
}

function imageHandoffPackagePrepressTicketPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const tasks = imageHandoffPackagePrepressTicketTasks(summary, scope, details);
  const holdCount = tasks.filter((task) => task.status === 'hold').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    ticketType: 'Image package prepress ticket',
    productionStatus: holdCount === 0 ? 'ready' : 'hold',
    holdCount,
    imageCount: summary.total,
    linkedImageCount: summary.linked,
    embeddedImageCount: summary.embedded,
    tasks,
  };
}

function imageHandoffPackagePrepressTicketRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const tasks = imageHandoffPackagePrepressTicketTasks(summary, scope, details);
  return [
    'Scope\tTask\tOwner\tStatus\tDetail\tEvidence',
    ...tasks.map((task) => [scope, task.task, task.owner, task.status, task.detail, task.evidence].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackagePrepressTicketLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const ticket = imageHandoffPackagePrepressTicketPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number; tasks: Array<{ task: string; owner: string; status: string; detail: string; evidence: string }> };
  return [
    '# AnchorWorks Image Package Prepress Ticket (' + scope + ')',
    'Production status: ' + (ticket.productionStatus ?? 'hold') + ' · ' + (ticket.holdCount ?? 0) + ' hold(s)',
    '',
    '## Production Tasks',
    ...ticket.tasks.map((task) => '- ' + task.status + ' · ' + task.owner + ' · ' + task.task + ' · ' + task.detail + ' · evidence: ' + task.evidence),
    '',
    (ticket.holdCount ?? 0) === 0 ? 'Prepress note: production ticket is ready for package execution.' : 'Prepress note: resolve held tasks before package release or print handoff.',
  ];
}

function imageHandoffPackagePrepressTicketJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackagePrepressTicketPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackagePrepressTicketTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrepressTicketRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePrepressTicketReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrepressTicketLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}


function imageHandoffPackagePrinterIntakeItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ item: string; status: 'ready' | 'hold' | 'pending'; detail: string; evidence: string }> {
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; expectedLinksFileCount?: number; blockerCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const prepressTicket = imageHandoffPackagePrepressTicketPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number };
  const rightsManifest = imageHandoffPackageRightsManifestPayload(scope, details) as { blockedCount?: number; reviewRequiredCount?: number };
  return [
    { item: 'Artwork file received', status: 'pending', detail: 'Confirm final artwork file is included with package.', evidence: 'Document artwork file' },
    { item: 'Links folder received', status: (deliveryManifest.expectedLinksFileCount ?? 0) > 0 ? 'pending' : 'ready', detail: (deliveryManifest.expectedLinksFileCount ?? 0) + ' expected linked file(s).', evidence: 'Links/' },
    { item: 'Delivery manifest reviewed', status: deliveryManifest.readyForDelivery ? 'ready' : 'hold', detail: (deliveryManifest.blockerCount ?? 0) + ' delivery blocker(s).', evidence: 'image-package-delivery-manifest.json' },
    { item: 'Prepress ticket reviewed', status: prepressTicket.productionStatus === 'ready' ? 'ready' : 'hold', detail: (prepressTicket.holdCount ?? 0) + ' prepress hold(s).', evidence: 'image-package-prepress-ticket.md' },
    { item: 'Rights/license proof reviewed', status: (rightsManifest.blockedCount ?? 0) === 0 && (rightsManifest.reviewRequiredCount ?? 0) === 0 ? 'ready' : 'hold', detail: (rightsManifest.blockedCount ?? 0) + ' blocked rights item(s), ' + (rightsManifest.reviewRequiredCount ?? 0) + ' review item(s).', evidence: 'image-package-rights-manifest.md' },
    { item: 'Release gate reviewed', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md' },
  ];
}

function imageHandoffPackagePrinterIntakePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const items = imageHandoffPackagePrinterIntakeItems(summary, scope, details);
  const holdCount = items.filter((item) => item.status === 'hold').length;
  const pendingCount = items.filter((item) => item.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    intakeType: 'Image package printer intake',
    intakeStatus: holdCount === 0 && pendingCount === 0 ? 'ready' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    receivedBy: '',
    receivedAt: '',
    shopJobNumber: '',
    items,
  };
}

function imageHandoffPackagePrinterIntakeRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const items = imageHandoffPackagePrinterIntakeItems(summary, scope, details);
  return [
    'Scope\tIntake Item\tStatus\tDetail\tEvidence',
    ...items.map((item) => [scope, item.item, item.status, item.detail, item.evidence].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackagePrinterIntakeLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const intake = imageHandoffPackagePrinterIntakePayload(summary, scope, details) as { intakeStatus?: string; holdCount?: number; pendingCount?: number; items: Array<{ item: string; status: string; detail: string; evidence: string }> };
  return [
    '# AnchorWorks Image Package Printer Intake (' + scope + ')',
    'Intake status: ' + (intake.intakeStatus ?? 'hold') + ' · ' + (intake.holdCount ?? 0) + ' hold(s) · ' + (intake.pendingCount ?? 0) + ' pending item(s)',
    '',
    '## Receiving Fields',
    '- Shop job number:',
    '- Received by:',
    '- Received at:',
    '',
    '## Intake Checklist',
    ...intake.items.map((item) => '- ' + item.status + ' · ' + item.item + ' · ' + item.detail + ' · evidence: ' + item.evidence),
    '',
    (intake.holdCount ?? 0) === 0 ? 'Intake note: package can be received once pending shop fields are completed.' : 'Intake note: hold intake until release/prepress/rights blockers are cleared.',
  ];
}

function imageHandoffPackagePrinterIntakeJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackagePrinterIntakePayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackagePrinterIntakeTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrinterIntakeRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePrinterIntakeReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrinterIntakeLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageShopProofChecklistItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ checkpoint: string; status: 'approved' | 'hold' | 'pending'; detail: string; evidence: string; approver: string }> {
  const intake = imageHandoffPackagePrinterIntakePayload(summary, scope, details) as { intakeStatus?: string; holdCount?: number; pendingCount?: number };
  const prepressTicket = imageHandoffPackagePrepressTicketPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const verificationSummary = imageHandoffPackageVerificationSummaryPayload(summary, scope, details) as { verificationStatus?: string; holdCount?: number };
  const rightsManifest = imageHandoffPackageRightsManifestPayload(scope, details) as { blockedCount?: number; reviewRequiredCount?: number };
  return [
    { checkpoint: 'Proof PDF or raster proof generated', status: 'pending', detail: 'Attach the shop proof generated from final artwork and collected Links.', evidence: 'Shop proof file', approver: 'Print shop proof operator' },
    { checkpoint: 'Package intake accepted', status: intake.intakeStatus === 'ready' ? 'approved' : (intake.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (intake.holdCount ?? 0) + ' intake hold(s), ' + (intake.pendingCount ?? 0) + ' pending intake item(s).', evidence: 'image-package-printer-intake.md', approver: 'Print shop receiving' },
    { checkpoint: 'Prepress ticket cleared', status: prepressTicket.productionStatus === 'ready' ? 'approved' : 'hold', detail: (prepressTicket.holdCount ?? 0) + ' prepress hold(s).', evidence: 'image-package-prepress-ticket.md', approver: 'Prepress lead' },
    { checkpoint: 'Rights and usage proof cleared', status: (rightsManifest.blockedCount ?? 0) === 0 && (rightsManifest.reviewRequiredCount ?? 0) === 0 ? 'approved' : 'hold', detail: (rightsManifest.blockedCount ?? 0) + ' blocked rights item(s), ' + (rightsManifest.reviewRequiredCount ?? 0) + ' review item(s).', evidence: 'image-package-rights-manifest.md', approver: 'Producer/client' },
    { checkpoint: 'Verification summary reviewed', status: verificationSummary.verificationStatus === 'ready' ? 'approved' : 'hold', detail: (verificationSummary.holdCount ?? 0) + ' verification hold(s).', evidence: 'image-package-verification-summary.md', approver: 'QA reviewer' },
    { checkpoint: 'Release gate approved for proof signoff', status: releaseGate.releaseStatus === 'ready' ? 'approved' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', approver: 'Client/prepress approver' },
  ];
}

function imageHandoffPackageShopProofChecklistPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const checkpoints = imageHandoffPackageShopProofChecklistItems(summary, scope, details);
  const holdCount = checkpoints.filter((item) => item.status === 'hold').length;
  const pendingCount = checkpoints.filter((item) => item.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    checklistType: 'Image package shop proof checklist',
    proofStatus: holdCount === 0 && pendingCount === 0 ? 'approved' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    proofRound: '',
    proofFile: '',
    approvedBy: '',
    approvedAt: '',
    checkpoints,
  };
}

function imageHandoffPackageShopProofChecklistRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const checkpoints = imageHandoffPackageShopProofChecklistItems(summary, scope, details);
  return [
    'Scope\tCheckpoint\tStatus\tDetail\tEvidence\tApprover',
    ...checkpoints.map((item) => [scope, item.checkpoint, item.status, item.detail, item.evidence, item.approver].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageShopProofChecklistLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const checklist = imageHandoffPackageShopProofChecklistPayload(summary, scope, details) as { proofStatus?: string; holdCount?: number; pendingCount?: number; checkpoints: Array<{ checkpoint: string; status: string; detail: string; evidence: string; approver: string }> };
  return [
    '# AnchorWorks Image Package Shop Proof Checklist (' + scope + ')',
    'Proof status: ' + (checklist.proofStatus ?? 'hold') + ' · ' + (checklist.holdCount ?? 0) + ' hold(s) · ' + (checklist.pendingCount ?? 0) + ' pending checkpoint(s)',
    '',
    '## Proof Fields',
    '- Proof round:',
    '- Proof file:',
    '- Approved by:',
    '- Approved at:',
    '',
    '## Proof Review Checkpoints',
    ...checklist.checkpoints.map((item) => '- ' + item.status + ' · ' + item.checkpoint + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · approver: ' + item.approver),
    '',
    (checklist.holdCount ?? 0) === 0 ? 'Proof note: shop proof can be approved once pending proof fields are completed.' : 'Proof note: hold proof approval until intake, prepress, rights, verification, and release blockers are cleared.',
  ];
}

function imageHandoffPackageShopProofChecklistJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageShopProofChecklistPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageShopProofChecklistTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageShopProofChecklistRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageShopProofChecklistReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageShopProofChecklistLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageProductionHandoffItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ stage: string; owner: string; status: 'ready' | 'hold' | 'pending'; detail: string; evidence: string; nextAction: string }> {
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; blockerCount?: number; expectedLinksFileCount?: number };
  const intake = imageHandoffPackagePrinterIntakePayload(summary, scope, details) as { intakeStatus?: string; holdCount?: number; pendingCount?: number };
  const proof = imageHandoffPackageShopProofChecklistPayload(summary, scope, details) as { proofStatus?: string; holdCount?: number; pendingCount?: number };
  const prepressTicket = imageHandoffPackagePrepressTicketPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return [
    { stage: 'Package received and staged', owner: 'Print shop receiving', status: intake.intakeStatus === 'ready' ? 'ready' : (intake.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (intake.holdCount ?? 0) + ' intake hold(s), ' + (intake.pendingCount ?? 0) + ' pending intake item(s).', evidence: 'image-package-printer-intake.md', nextAction: 'Complete receiving fields and confirm Links folder custody.' },
    { stage: 'Production files collected', owner: 'Prepress operator', status: deliveryManifest.readyForDelivery ? 'ready' : 'hold', detail: (deliveryManifest.expectedLinksFileCount ?? 0) + ' linked file(s), ' + (deliveryManifest.blockerCount ?? 0) + ' delivery blocker(s).', evidence: 'image-package-delivery-manifest.json', nextAction: 'Collect missing sources or resolve delivery blockers before scheduling.' },
    { stage: 'Prepress ticket scheduled', owner: 'Prepress lead', status: prepressTicket.productionStatus === 'ready' ? 'ready' : 'hold', detail: (prepressTicket.holdCount ?? 0) + ' prepress hold(s).', evidence: 'image-package-prepress-ticket.md', nextAction: 'Clear production ticket holds and assign operator.' },
    { stage: 'Shop proof approved', owner: 'Client/prepress approver', status: proof.proofStatus === 'approved' ? 'ready' : (proof.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (proof.holdCount ?? 0) + ' proof hold(s), ' + (proof.pendingCount ?? 0) + ' pending proof checkpoint(s).', evidence: 'image-package-shop-proof-checklist.md', nextAction: 'Attach proof file and record approval before press.' },
    { stage: 'Final release gate cleared', owner: 'Production manager', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', nextAction: 'Do not release to production until gate is ready.' },
  ];
}

function imageHandoffPackageProductionHandoffPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const stages = imageHandoffPackageProductionHandoffItems(summary, scope, details);
  const holdCount = stages.filter((stage) => stage.status === 'hold').length;
  const pendingCount = stages.filter((stage) => stage.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    handoffType: 'Image package production handoff',
    productionStatus: holdCount === 0 && pendingCount === 0 ? 'ready' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    productionJobNumber: '',
    scheduledPress: '',
    productionOwner: '',
    handoffAcceptedBy: '',
    handoffAcceptedAt: '',
    stages,
  };
}

function imageHandoffPackageProductionHandoffRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const stages = imageHandoffPackageProductionHandoffItems(summary, scope, details);
  return [
    'Scope\tStage\tOwner\tStatus\tDetail\tEvidence\tNext Action',
    ...stages.map((stage) => [scope, stage.stage, stage.owner, stage.status, stage.detail, stage.evidence, stage.nextAction].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageProductionHandoffJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageProductionHandoffPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageProductionHandoffTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageProductionHandoffRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePrintReleaseApprovalItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ approval: string; status: 'approved' | 'hold' | 'pending'; detail: string; evidence: string; signer: string }> {
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; blockerCount?: number };
  const proof = imageHandoffPackageShopProofChecklistPayload(summary, scope, details) as { proofStatus?: string; holdCount?: number; pendingCount?: number };
  const productionHandoff = imageHandoffPackageProductionHandoffPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const rightsManifest = imageHandoffPackageRightsManifestPayload(scope, details) as { blockedCount?: number; reviewRequiredCount?: number };
  return [
    { approval: 'Delivery manifest accepted', status: deliveryManifest.readyForDelivery ? 'approved' : 'hold', detail: (deliveryManifest.blockerCount ?? 0) + ' delivery blocker(s).', evidence: 'image-package-delivery-manifest.json', signer: 'Production manager' },
    { approval: 'Rights and usage release accepted', status: (rightsManifest.blockedCount ?? 0) === 0 && (rightsManifest.reviewRequiredCount ?? 0) === 0 ? 'approved' : 'hold', detail: (rightsManifest.blockedCount ?? 0) + ' blocked rights item(s), ' + (rightsManifest.reviewRequiredCount ?? 0) + ' review item(s).', evidence: 'image-package-rights-manifest.md', signer: 'Client/producer' },
    { approval: 'Shop proof signed off', status: proof.proofStatus === 'approved' ? 'approved' : (proof.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (proof.holdCount ?? 0) + ' proof hold(s), ' + (proof.pendingCount ?? 0) + ' pending proof checkpoint(s).', evidence: 'image-package-shop-proof-checklist.md', signer: 'Client/prepress approver' },
    { approval: 'Production handoff accepted', status: productionHandoff.productionStatus === 'ready' ? 'approved' : (productionHandoff.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (productionHandoff.holdCount ?? 0) + ' production hold(s), ' + (productionHandoff.pendingCount ?? 0) + ' pending production item(s).', evidence: 'image-package-production-handoff.json', signer: 'Print shop receiving' },
    { approval: 'Release gate cleared for print', status: releaseGate.releaseStatus === 'ready' ? 'approved' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', signer: 'Final approver' },
  ];
}

function imageHandoffPackagePrintReleaseApprovalPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const approvals = imageHandoffPackagePrintReleaseApprovalItems(summary, scope, details);
  const holdCount = approvals.filter((approval) => approval.status === 'hold').length;
  const pendingCount = approvals.filter((approval) => approval.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    approvalType: 'Image package print release approval',
    approvalStatus: holdCount === 0 && pendingCount === 0 ? 'approved' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    printReleaseNumber: '',
    approvedBy: '',
    approvedAt: '',
    approvedForPress: false,
    approvals,
  };
}

function imageHandoffPackagePrintReleaseApprovalRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const approvals = imageHandoffPackagePrintReleaseApprovalItems(summary, scope, details);
  return [
    'Scope\tApproval\tStatus\tDetail\tEvidence\tSigner',
    ...approvals.map((approval) => [scope, approval.approval, approval.status, approval.detail, approval.evidence, approval.signer].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackagePrintReleaseApprovalLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const approval = imageHandoffPackagePrintReleaseApprovalPayload(summary, scope, details) as { approvalStatus?: string; holdCount?: number; pendingCount?: number; approvals: Array<{ approval: string; status: string; detail: string; evidence: string; signer: string }> };
  return [
    '# AnchorWorks Image Package Print Release Approval (' + scope + ')',
    'Approval status: ' + (approval.approvalStatus ?? 'hold') + ' · ' + (approval.holdCount ?? 0) + ' hold(s) · ' + (approval.pendingCount ?? 0) + ' pending approval(s)',
    '',
    '## Final Release Fields',
    '- Print release number:',
    '- Approved by:',
    '- Approved at:',
    '- Approved for press: no',
    '',
    '## Approval Checklist',
    ...approval.approvals.map((item) => '- ' + item.status + ' · ' + item.approval + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · signer: ' + item.signer),
    '',
    (approval.holdCount ?? 0) === 0 ? 'Approval note: final print release can be signed once pending release fields are completed.' : 'Approval note: hold final print release until delivery, rights, proof, production, and gate blockers are cleared.',
  ];
}

function imageHandoffPackagePrintReleaseApprovalJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackagePrintReleaseApprovalPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackagePrintReleaseApprovalTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrintReleaseApprovalRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePrintReleaseApprovalReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePrintReleaseApprovalLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageVendorQaItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ check: string; owner: string; status: 'pass' | 'hold' | 'pending'; detail: string; evidence: string; disposition: string }> {
  const verificationSummary = imageHandoffPackageVerificationSummaryPayload(summary, scope, details) as { verificationStatus?: string; holdCount?: number };
  const productionHandoff = imageHandoffPackageProductionHandoffPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number; pendingCount?: number };
  const printApproval = imageHandoffPackagePrintReleaseApprovalPayload(summary, scope, details) as { approvalStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; blockerCount?: number };
  return [
    { check: 'Package verification accepted', owner: 'Vendor QA', status: verificationSummary.verificationStatus === 'ready' ? 'pass' : 'hold', detail: (verificationSummary.holdCount ?? 0) + ' verification hold(s).', evidence: 'image-package-verification-summary.md', disposition: 'Reject package until verification holds are cleared.' },
    { check: 'Delivery manifest accepted', owner: 'Vendor QA', status: deliveryManifest.readyForDelivery ? 'pass' : 'hold', detail: (deliveryManifest.blockerCount ?? 0) + ' delivery blocker(s).', evidence: 'image-package-delivery-manifest.json', disposition: 'Request corrected package manifest or missing deliverables.' },
    { check: 'Production handoff accepted', owner: 'Vendor production coordinator', status: productionHandoff.productionStatus === 'ready' ? 'pass' : (productionHandoff.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (productionHandoff.holdCount ?? 0) + ' production hold(s), ' + (productionHandoff.pendingCount ?? 0) + ' pending production item(s).', evidence: 'image-package-production-handoff.json', disposition: 'Hold vendor scheduling until production owner accepts handoff.' },
    { check: 'Print release approval accepted', owner: 'Vendor QA', status: printApproval.approvalStatus === 'approved' ? 'pass' : (printApproval.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (printApproval.holdCount ?? 0) + ' approval hold(s), ' + (printApproval.pendingCount ?? 0) + ' pending approval item(s).', evidence: 'image-package-print-release-approval.md', disposition: 'Do not release to vendor/press without final approval.' },
    { check: 'Release gate accepted', owner: 'Vendor QA lead', status: releaseGate.releaseStatus === 'ready' ? 'pass' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', disposition: 'Escalate release gate holds before vendor acceptance.' },
  ];
}

function imageHandoffPackageVendorQaPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const checks = imageHandoffPackageVendorQaItems(summary, scope, details);
  const holdCount = checks.filter((check) => check.status === 'hold').length;
  const pendingCount = checks.filter((check) => check.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    qaType: 'Image package vendor QA',
    qaStatus: holdCount === 0 && pendingCount === 0 ? 'accepted' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    vendorName: '',
    vendorJobNumber: '',
    qaReviewer: '',
    reviewedAt: '',
    checks,
  };
}

function imageHandoffPackageVendorQaRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const checks = imageHandoffPackageVendorQaItems(summary, scope, details);
  return [
    'Scope\tQA Check\tOwner\tStatus\tDetail\tEvidence\tDisposition',
    ...checks.map((check) => [scope, check.check, check.owner, check.status, check.detail, check.evidence, check.disposition].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageVendorQaLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const qa = imageHandoffPackageVendorQaPayload(summary, scope, details) as { qaStatus?: string; holdCount?: number; pendingCount?: number; checks: Array<{ check: string; owner: string; status: string; detail: string; evidence: string; disposition: string }> };
  return [
    '# AnchorWorks Image Package Vendor QA (' + scope + ')',
    'QA status: ' + (qa.qaStatus ?? 'hold') + ' · ' + (qa.holdCount ?? 0) + ' hold(s) · ' + (qa.pendingCount ?? 0) + ' pending check(s)',
    '',
    '## Vendor QA Fields',
    '- Vendor name:',
    '- Vendor job number:',
    '- QA reviewer:',
    '- Reviewed at:',
    '',
    '## Acceptance Checks',
    ...qa.checks.map((check) => '- ' + check.status + ' · ' + check.check + ' · owner: ' + check.owner + ' · ' + check.detail + ' · evidence: ' + check.evidence + ' · disposition: ' + check.disposition),
    '',
    (qa.holdCount ?? 0) === 0 ? 'Vendor QA note: package can be accepted once pending vendor fields are completed.' : 'Vendor QA note: reject or hold supplier release until verification, delivery, production, approval, and gate blockers are cleared.',
  ];
}

function imageHandoffPackageVendorQaJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageVendorQaPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageVendorQaTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageVendorQaRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageVendorQaReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageVendorQaLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePressRunTicketItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ setup: string; station: string; status: 'ready' | 'hold' | 'pending'; detail: string; evidence: string; operatorAction: string }> {
  const productionHandoff = imageHandoffPackageProductionHandoffPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number; pendingCount?: number };
  const printApproval = imageHandoffPackagePrintReleaseApprovalPayload(summary, scope, details) as { approvalStatus?: string; holdCount?: number; pendingCount?: number };
  const vendorQa = imageHandoffPackageVendorQaPayload(summary, scope, details) as { qaStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const prepressTicket = imageHandoffPackagePrepressTicketPayload(summary, scope, details) as { productionStatus?: string; holdCount?: number };
  return [
    { setup: 'Prepress ticket cleared for press', station: 'Prepress', status: prepressTicket.productionStatus === 'ready' ? 'ready' : 'hold', detail: (prepressTicket.holdCount ?? 0) + ' prepress hold(s).', evidence: 'image-package-prepress-ticket.md', operatorAction: 'Confirm separations, Links, and operator notes before plate/output.' },
    { setup: 'Production handoff accepted', station: 'Production desk', status: productionHandoff.productionStatus === 'ready' ? 'ready' : (productionHandoff.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (productionHandoff.holdCount ?? 0) + ' production hold(s), ' + (productionHandoff.pendingCount ?? 0) + ' pending production item(s).', evidence: 'image-package-production-handoff.json', operatorAction: 'Confirm job number, press, owner, and handoff acceptance.' },
    { setup: 'Print release approved', station: 'Approval desk', status: printApproval.approvalStatus === 'approved' ? 'ready' : (printApproval.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (printApproval.holdCount ?? 0) + ' approval hold(s), ' + (printApproval.pendingCount ?? 0) + ' pending approval item(s).', evidence: 'image-package-print-release-approval.md', operatorAction: 'Verify client/shop approval before starting press.' },
    { setup: 'Vendor QA accepted', station: 'Vendor QA', status: vendorQa.qaStatus === 'accepted' ? 'ready' : (vendorQa.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (vendorQa.holdCount ?? 0) + ' vendor QA hold(s), ' + (vendorQa.pendingCount ?? 0) + ' pending vendor QA check(s).', evidence: 'image-package-vendor-qa.md', operatorAction: 'Resolve vendor QA disposition before run.' },
    { setup: 'Release gate clear for production start', station: 'Production manager', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', operatorAction: 'Stop press start until release gate is ready.' },
  ];
}

function imageHandoffPackagePressRunTicketPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const setups = imageHandoffPackagePressRunTicketItems(summary, scope, details);
  const holdCount = setups.filter((setup) => setup.status === 'hold').length;
  const pendingCount = setups.filter((setup) => setup.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    ticketType: 'Image package press run ticket',
    pressRunStatus: holdCount === 0 && pendingCount === 0 ? 'ready' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    pressRunNumber: '',
    pressOperator: '',
    scheduledPress: '',
    substrate: '',
    inkSet: '',
    setups,
  };
}

function imageHandoffPackagePressRunTicketRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const setups = imageHandoffPackagePressRunTicketItems(summary, scope, details);
  return [
    'Scope\tSetup\tStation\tStatus\tDetail\tEvidence\tOperator Action',
    ...setups.map((setup) => [scope, setup.setup, setup.station, setup.status, setup.detail, setup.evidence, setup.operatorAction].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackagePressRunTicketLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const ticket = imageHandoffPackagePressRunTicketPayload(summary, scope, details) as { pressRunStatus?: string; holdCount?: number; pendingCount?: number; setups: Array<{ setup: string; station: string; status: string; detail: string; evidence: string; operatorAction: string }> };
  return [
    '# AnchorWorks Image Package Press Run Ticket (' + scope + ')',
    'Press run status: ' + (ticket.pressRunStatus ?? 'hold') + ' · ' + (ticket.holdCount ?? 0) + ' hold(s) · ' + (ticket.pendingCount ?? 0) + ' pending setup(s)',
    '',
    '## Press Run Fields',
    '- Press run number:',
    '- Press operator:',
    '- Scheduled press:',
    '- Substrate:',
    '- Ink set:',
    '',
    '## Setup Checks',
    ...ticket.setups.map((setup) => '- ' + setup.status + ' · ' + setup.setup + ' · station: ' + setup.station + ' · ' + setup.detail + ' · evidence: ' + setup.evidence + ' · action: ' + setup.operatorAction),
    '',
    (ticket.holdCount ?? 0) === 0 ? 'Press run note: production can start once pending press fields are completed.' : 'Press run note: hold production start until prepress, production handoff, approval, vendor QA, and release gate blockers are cleared.',
  ];
}

function imageHandoffPackagePressRunTicketJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackagePressRunTicketPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackagePressRunTicketTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePressRunTicketRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePressRunTicketReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePressRunTicketLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePostpressInspectionItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ inspection: string; station: string; status: 'pass' | 'hold' | 'pending'; detail: string; evidence: string; correctiveAction: string }> {
  const pressRun = imageHandoffPackagePressRunTicketPayload(summary, scope, details) as { pressRunStatus?: string; holdCount?: number; pendingCount?: number };
  const vendorQa = imageHandoffPackageVendorQaPayload(summary, scope, details) as { qaStatus?: string; holdCount?: number; pendingCount?: number };
  const printApproval = imageHandoffPackagePrintReleaseApprovalPayload(summary, scope, details) as { approvalStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  const deliveryReceipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus?: string; pendingCount?: number; holdCount?: number };
  return [
    { inspection: 'Press run evidence reviewed', station: 'Pressroom QA', status: pressRun.pressRunStatus === 'ready' ? 'pass' : (pressRun.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (pressRun.holdCount ?? 0) + ' press run hold(s), ' + (pressRun.pendingCount ?? 0) + ' pending press setup(s).', evidence: 'image-package-press-run-ticket.md', correctiveAction: 'Hold finished-goods release until press run ticket is ready.' },
    { inspection: 'Vendor QA release reviewed', station: 'Vendor QA', status: vendorQa.qaStatus === 'accepted' ? 'pass' : (vendorQa.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (vendorQa.holdCount ?? 0) + ' vendor QA hold(s), ' + (vendorQa.pendingCount ?? 0) + ' pending vendor QA check(s).', evidence: 'image-package-vendor-qa.md', correctiveAction: 'Resolve supplier QA dispositions before final inspection.' },
    { inspection: 'Print approval matched output', station: 'Final inspection', status: printApproval.approvalStatus === 'approved' ? 'pass' : (printApproval.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (printApproval.holdCount ?? 0) + ' approval hold(s), ' + (printApproval.pendingCount ?? 0) + ' pending approval item(s).', evidence: 'image-package-print-release-approval.md', correctiveAction: 'Compare finished goods against approved proof/release.' },
    { inspection: 'Delivery receipt ready for closeout', station: 'Shipping QA', status: deliveryReceipt.receiptStatus === 'ready' ? 'pass' : (deliveryReceipt.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (deliveryReceipt.holdCount ?? 0) + ' receipt hold(s), ' + (deliveryReceipt.pendingCount ?? 0) + ' pending receipt item(s).', evidence: 'image-package-delivery-receipt.md', correctiveAction: 'Complete receiving/signoff fields before closeout.' },
    { inspection: 'Release gate still clear after postpress', station: 'QA lead', status: releaseGate.releaseStatus === 'ready' ? 'pass' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', correctiveAction: 'Escalate release gate holds before shipping finished goods.' },
  ];
}

function imageHandoffPackagePostpressInspectionPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const inspections = imageHandoffPackagePostpressInspectionItems(summary, scope, details);
  const holdCount = inspections.filter((inspection) => inspection.status === 'hold').length;
  const pendingCount = inspections.filter((inspection) => inspection.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    inspectionType: 'Image package postpress inspection',
    inspectionStatus: holdCount === 0 && pendingCount === 0 ? 'passed' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    inspector: '',
    inspectedAt: '',
    lotNumber: '',
    sampleSize: '',
    defectSummary: '',
    inspections,
  };
}

function imageHandoffPackagePostpressInspectionRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const inspections = imageHandoffPackagePostpressInspectionItems(summary, scope, details);
  return [
    'Scope\tInspection\tStation\tStatus\tDetail\tEvidence\tCorrective Action',
    ...inspections.map((inspection) => [scope, inspection.inspection, inspection.station, inspection.status, inspection.detail, inspection.evidence, inspection.correctiveAction].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackagePostpressInspectionLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const inspection = imageHandoffPackagePostpressInspectionPayload(summary, scope, details) as { inspectionStatus?: string; holdCount?: number; pendingCount?: number; inspections: Array<{ inspection: string; station: string; status: string; detail: string; evidence: string; correctiveAction: string }> };
  return [
    '# AnchorWorks Image Package Postpress Inspection (' + scope + ')',
    'Inspection status: ' + (inspection.inspectionStatus ?? 'hold') + ' · ' + (inspection.holdCount ?? 0) + ' hold(s) · ' + (inspection.pendingCount ?? 0) + ' pending inspection(s)',
    '',
    '## Inspection Fields',
    '- Inspector:',
    '- Inspected at:',
    '- Lot number:',
    '- Sample size:',
    '- Defect summary:',
    '',
    '## Finished-Goods Checks',
    ...inspection.inspections.map((item) => '- ' + item.status + ' · ' + item.inspection + ' · station: ' + item.station + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · corrective action: ' + item.correctiveAction),
    '',
    (inspection.holdCount ?? 0) === 0 ? 'Postpress note: finished goods can proceed once pending inspection fields are completed.' : 'Postpress note: hold finished-goods release until press, vendor QA, approval, receipt, and gate blockers are cleared.',
  ];
}

function imageHandoffPackagePostpressInspectionJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackagePostpressInspectionPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackagePostpressInspectionTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePostpressInspectionRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackagePostpressInspectionReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackagePostpressInspectionLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageFinishedGoodsReleaseItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ release: string; owner: string; status: 'ready' | 'hold' | 'pending'; detail: string; evidence: string; releaseAction: string }> {
  const postpress = imageHandoffPackagePostpressInspectionPayload(summary, scope, details) as { inspectionStatus?: string; holdCount?: number; pendingCount?: number };
  const deliveryReceipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus?: string; holdCount?: number; pendingCount?: number };
  const acceptance = imageHandoffPackageAcceptancePayload(summary, scope, details) as { acceptanceStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseNotes = imageHandoffPackageReleaseNotesPayload(summary, scope, details) as { releaseStatus?: string; blockerCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return [
    { release: 'Postpress inspection passed', owner: 'QA lead', status: postpress.inspectionStatus === 'passed' ? 'ready' : (postpress.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (postpress.holdCount ?? 0) + ' postpress hold(s), ' + (postpress.pendingCount ?? 0) + ' pending inspection item(s).', evidence: 'image-package-postpress-inspection.md', releaseAction: 'Do not pack finished goods until inspection is passed.' },
    { release: 'Client/shop acceptance ready', owner: 'Producer/client', status: acceptance.acceptanceStatus === 'ready' ? 'ready' : (acceptance.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (acceptance.holdCount ?? 0) + ' acceptance hold(s), ' + (acceptance.pendingCount ?? 0) + ' pending acceptance item(s).', evidence: 'image-package-acceptance.json', releaseAction: 'Capture acceptance or resolve pending review items.' },
    { release: 'Delivery receipt ready', owner: 'Shipping coordinator', status: deliveryReceipt.receiptStatus === 'ready' ? 'ready' : (deliveryReceipt.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (deliveryReceipt.holdCount ?? 0) + ' receipt hold(s), ' + (deliveryReceipt.pendingCount ?? 0) + ' pending receipt item(s).', evidence: 'image-package-delivery-receipt.md', releaseAction: 'Prepare receipt/signoff before shipment closeout.' },
    { release: 'Release notes clear', owner: 'Account/production manager', status: releaseNotes.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseNotes.blockerCount ?? 0) + ' release note blocker(s).', evidence: 'image-package-release-notes.md', releaseAction: 'Share final notes and remove release blockers.' },
    { release: 'Release gate clear for shipment', owner: 'Release manager', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', releaseAction: 'Hold finished goods until final gate is ready.' },
  ];
}

function imageHandoffPackageFinishedGoodsReleasePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const releases = imageHandoffPackageFinishedGoodsReleaseItems(summary, scope, details);
  const holdCount = releases.filter((release) => release.status === 'hold').length;
  const pendingCount = releases.filter((release) => release.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    releaseType: 'Image package finished goods release',
    finishedGoodsStatus: holdCount === 0 && pendingCount === 0 ? 'ready' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    releaseNumber: '',
    packedBy: '',
    packedAt: '',
    shipmentMethod: '',
    trackingNumber: '',
    releases,
  };
}

function imageHandoffPackageFinishedGoodsReleaseRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const releases = imageHandoffPackageFinishedGoodsReleaseItems(summary, scope, details);
  return [
    'Scope\tRelease Check\tOwner\tStatus\tDetail\tEvidence\tRelease Action',
    ...releases.map((release) => [scope, release.release, release.owner, release.status, release.detail, release.evidence, release.releaseAction].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageFinishedGoodsReleaseLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const release = imageHandoffPackageFinishedGoodsReleasePayload(summary, scope, details) as { finishedGoodsStatus?: string; holdCount?: number; pendingCount?: number; releases: Array<{ release: string; owner: string; status: string; detail: string; evidence: string; releaseAction: string }> };
  return [
    '# AnchorWorks Image Package Finished Goods Release (' + scope + ')',
    'Finished-goods status: ' + (release.finishedGoodsStatus ?? 'hold') + ' · ' + (release.holdCount ?? 0) + ' hold(s) · ' + (release.pendingCount ?? 0) + ' pending release item(s)',
    '',
    '## Shipment Fields',
    '- Release number:',
    '- Packed by:',
    '- Packed at:',
    '- Shipment method:',
    '- Tracking number:',
    '',
    '## Release Checks',
    ...release.releases.map((item) => '- ' + item.status + ' · ' + item.release + ' · owner: ' + item.owner + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · action: ' + item.releaseAction),
    '',
    (release.holdCount ?? 0) === 0 ? 'Finished goods note: shipment can proceed once pending shipment fields are completed.' : 'Finished goods note: hold shipment until postpress, acceptance, receipt, release notes, and gate blockers are cleared.',
  ];
}

function imageHandoffPackageFinishedGoodsReleaseJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageFinishedGoodsReleasePayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageFinishedGoodsReleaseTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageFinishedGoodsReleaseRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageFinishedGoodsReleaseReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageFinishedGoodsReleaseLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageShipmentHandoffItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ handoff: string; owner: string; status: 'ready' | 'hold' | 'pending'; detail: string; evidence: string; custodyAction: string }> {
  const finishedGoods = imageHandoffPackageFinishedGoodsReleasePayload(summary, scope, details) as { finishedGoodsStatus?: string; holdCount?: number; pendingCount?: number };
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; blockerCount?: number };
  const deliveryReceipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseNotes = imageHandoffPackageReleaseNotesPayload(summary, scope, details) as { releaseStatus?: string; blockerCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return [
    { handoff: 'Finished goods released to shipping', owner: 'Shipping coordinator', status: finishedGoods.finishedGoodsStatus === 'ready' ? 'ready' : (finishedGoods.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (finishedGoods.holdCount ?? 0) + ' finished-goods hold(s), ' + (finishedGoods.pendingCount ?? 0) + ' pending release item(s).', evidence: 'image-package-finished-goods-release.md', custodyAction: 'Do not tender to carrier until finished goods release is ready.' },
    { handoff: 'Package deliverables reconciled', owner: 'Packaging/shipping QA', status: deliveryManifest.readyForDelivery ? 'ready' : 'hold', detail: (deliveryManifest.blockerCount ?? 0) + ' delivery blocker(s).', evidence: 'image-package-delivery-manifest.json', custodyAction: 'Reconcile physical/digital deliverables before shipment.' },
    { handoff: 'Delivery receipt prepared', owner: 'Recipient/customer service', status: deliveryReceipt.receiptStatus === 'ready' ? 'ready' : (deliveryReceipt.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (deliveryReceipt.holdCount ?? 0) + ' receipt hold(s), ' + (deliveryReceipt.pendingCount ?? 0) + ' pending receipt item(s).', evidence: 'image-package-delivery-receipt.md', custodyAction: 'Attach receipt and recipient signoff instructions.' },
    { handoff: 'Release notes included', owner: 'Account manager', status: releaseNotes.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseNotes.blockerCount ?? 0) + ' release note blocker(s).', evidence: 'image-package-release-notes.md', custodyAction: 'Include final release notes with shipment/customer handoff.' },
    { handoff: 'Release gate clear for carrier handoff', owner: 'Release manager', status: releaseGate.releaseStatus === 'ready' ? 'ready' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', custodyAction: 'Hold carrier/customer handoff until release gate is ready.' },
  ];
}

function imageHandoffPackageShipmentHandoffPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const handoffs = imageHandoffPackageShipmentHandoffItems(summary, scope, details);
  const holdCount = handoffs.filter((handoff) => handoff.status === 'hold').length;
  const pendingCount = handoffs.filter((handoff) => handoff.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    handoffType: 'Image package shipment handoff',
    shipmentStatus: holdCount === 0 && pendingCount === 0 ? 'ready' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    carrier: '',
    serviceLevel: '',
    trackingNumber: '',
    shippedAt: '',
    recipient: '',
    handoffs,
  };
}

function imageHandoffPackageShipmentHandoffRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const handoffs = imageHandoffPackageShipmentHandoffItems(summary, scope, details);
  return [
    'Scope\tHandoff\tOwner\tStatus\tDetail\tEvidence\tCustody Action',
    ...handoffs.map((handoff) => [scope, handoff.handoff, handoff.owner, handoff.status, handoff.detail, handoff.evidence, handoff.custodyAction].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageShipmentHandoffLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const handoff = imageHandoffPackageShipmentHandoffPayload(summary, scope, details) as { shipmentStatus?: string; holdCount?: number; pendingCount?: number; handoffs: Array<{ handoff: string; owner: string; status: string; detail: string; evidence: string; custodyAction: string }> };
  return [
    '# AnchorWorks Image Package Shipment Handoff (' + scope + ')',
    'Shipment status: ' + (handoff.shipmentStatus ?? 'hold') + ' · ' + (handoff.holdCount ?? 0) + ' hold(s) · ' + (handoff.pendingCount ?? 0) + ' pending handoff item(s)',
    '',
    '## Shipment Fields',
    '- Carrier:',
    '- Service level:',
    '- Tracking number:',
    '- Shipped at:',
    '- Recipient:',
    '',
    '## Custody Checks',
    ...handoff.handoffs.map((item) => '- ' + item.status + ' · ' + item.handoff + ' · owner: ' + item.owner + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · custody action: ' + item.custodyAction),
    '',
    (handoff.holdCount ?? 0) === 0 ? 'Shipment note: carrier/customer handoff can proceed once pending shipment fields are completed.' : 'Shipment note: hold shipment until finished goods, delivery, receipt, release notes, and gate blockers are cleared.',
  ];
}

function imageHandoffPackageShipmentHandoffJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageShipmentHandoffPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageShipmentHandoffTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageShipmentHandoffRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageShipmentHandoffReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageShipmentHandoffLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageDeliveryConfirmationItems(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Array<{ confirmation: string; owner: string; status: 'confirmed' | 'hold' | 'pending'; detail: string; evidence: string; followUp: string }> {
  const shipmentHandoff = imageHandoffPackageShipmentHandoffPayload(summary, scope, details) as { shipmentStatus?: string; holdCount?: number; pendingCount?: number };
  const deliveryReceipt = imageHandoffPackageDeliveryReceiptPayload(summary, scope, details) as { receiptStatus?: string; holdCount?: number; pendingCount?: number };
  const acceptance = imageHandoffPackageAcceptancePayload(summary, scope, details) as { acceptanceStatus?: string; holdCount?: number; pendingCount?: number };
  const releaseNotes = imageHandoffPackageReleaseNotesPayload(summary, scope, details) as { releaseStatus?: string; blockerCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return [
    { confirmation: 'Shipment handoff completed', owner: 'Shipping coordinator', status: shipmentHandoff.shipmentStatus === 'ready' ? 'confirmed' : (shipmentHandoff.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (shipmentHandoff.holdCount ?? 0) + ' shipment hold(s), ' + (shipmentHandoff.pendingCount ?? 0) + ' pending shipment item(s).', evidence: 'image-package-shipment-handoff.md', followUp: 'Confirm carrier/customer custody before marking delivered.' },
    { confirmation: 'Delivery receipt signed', owner: 'Recipient/customer service', status: deliveryReceipt.receiptStatus === 'ready' ? 'confirmed' : (deliveryReceipt.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (deliveryReceipt.holdCount ?? 0) + ' receipt hold(s), ' + (deliveryReceipt.pendingCount ?? 0) + ' pending receipt item(s).', evidence: 'image-package-delivery-receipt.md', followUp: 'Collect recipient signature or exception note.' },
    { confirmation: 'Client/shop acceptance confirmed', owner: 'Producer/client', status: acceptance.acceptanceStatus === 'ready' ? 'confirmed' : (acceptance.holdCount ?? 0) > 0 ? 'hold' : 'pending', detail: (acceptance.holdCount ?? 0) + ' acceptance hold(s), ' + (acceptance.pendingCount ?? 0) + ' pending acceptance item(s).', evidence: 'image-package-acceptance.json', followUp: 'Resolve acceptance exceptions before closeout.' },
    { confirmation: 'Release notes acknowledged', owner: 'Account manager', status: releaseNotes.releaseStatus === 'ready' ? 'confirmed' : 'hold', detail: (releaseNotes.blockerCount ?? 0) + ' release note blocker(s).', evidence: 'image-package-release-notes.md', followUp: 'Send release notes with delivery confirmation.' },
    { confirmation: 'Release gate remains clear after delivery', owner: 'Release manager', status: releaseGate.releaseStatus === 'ready' ? 'confirmed' : 'hold', detail: (releaseGate.holdCount ?? 0) + ' release hold(s).', evidence: 'image-package-release-gate.md', followUp: 'Escalate gate holds before final delivery closeout.' },
  ];
}

function imageHandoffPackageDeliveryConfirmationPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const confirmations = imageHandoffPackageDeliveryConfirmationItems(summary, scope, details);
  const holdCount = confirmations.filter((confirmation) => confirmation.status === 'hold').length;
  const pendingCount = confirmations.filter((confirmation) => confirmation.status === 'pending').length;
  return {
    scope,
    generatedBy: 'AnchorWorks',
    confirmationType: 'Image package delivery confirmation',
    deliveryStatus: holdCount === 0 && pendingCount === 0 ? 'confirmed' : holdCount > 0 ? 'hold' : 'pending',
    holdCount,
    pendingCount,
    deliveredAt: '',
    receivedBy: '',
    recipientSignature: '',
    deliveryException: '',
    confirmations,
  };
}

function imageHandoffPackageDeliveryConfirmationRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const confirmations = imageHandoffPackageDeliveryConfirmationItems(summary, scope, details);
  return [
    'Scope\tConfirmation\tOwner\tStatus\tDetail\tEvidence\tFollow-up',
    ...confirmations.map((confirmation) => [scope, confirmation.confirmation, confirmation.owner, confirmation.status, confirmation.detail, confirmation.evidence, confirmation.followUp].map(imageHandoffTsvCell).join('\t')),
  ];
}

function imageHandoffPackageDeliveryConfirmationLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const confirmation = imageHandoffPackageDeliveryConfirmationPayload(summary, scope, details) as { deliveryStatus?: string; holdCount?: number; pendingCount?: number; confirmations: Array<{ confirmation: string; owner: string; status: string; detail: string; evidence: string; followUp: string }> };
  return [
    '# AnchorWorks Image Package Delivery Confirmation (' + scope + ')',
    'Delivery status: ' + (confirmation.deliveryStatus ?? 'hold') + ' · ' + (confirmation.holdCount ?? 0) + ' hold(s) · ' + (confirmation.pendingCount ?? 0) + ' pending confirmation(s)',
    '',
    '## Confirmation Fields',
    '- Delivered at:',
    '- Received by:',
    '- Recipient signature:',
    '- Delivery exception:',
    '',
    '## Receipt Checks',
    ...confirmation.confirmations.map((item) => '- ' + item.status + ' · ' + item.confirmation + ' · owner: ' + item.owner + ' · ' + item.detail + ' · evidence: ' + item.evidence + ' · follow-up: ' + item.followUp),
    '',
    (confirmation.holdCount ?? 0) === 0 ? 'Delivery note: delivery can be closed once pending confirmation fields are completed.' : 'Delivery note: hold delivery closeout until shipment, receipt, acceptance, release notes, and gate blockers are cleared.',
  ];
}

function imageHandoffPackageDeliveryConfirmationJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageDeliveryConfirmationPayload(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)), null, 2);
}

function imageHandoffPackageDeliveryConfirmationTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDeliveryConfirmationRows(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageDeliveryConfirmationReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDeliveryConfirmationLines(collectImageLinksSummary(inScope), scope, collectImageHandoffDetails(inScope)).join('\n');
}

function imageHandoffPackageCiManifestPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  const releaseGate = imageHandoffPackageReleaseGatePayload(summary, scope, details) as { releaseStatus?: string; holdCount?: number };
  return {
    scope,
    generatedBy: 'AnchorWorks',
    releaseStatus: releaseGate.releaseStatus ?? 'hold',
    holdCount: releaseGate.holdCount ?? 0,
    expectedLinksFileCount: verifyManifest.expectedFileCount ?? 0,
    requiredArtifacts: [
      'README.md',
      'image-package-gate.json',
      'image-package-verify-manifest.json',
      'image-package-audit.json',
      'image-package-digests.tsv',
      'image-package-delivery-manifest.json',
      'image-package-provenance.json',
      'image-package-provenance.tsv',
      'image-package-rights-manifest.md',
      'image-package-rights-manifest.json',
      'image-package-rights-manifest.tsv',
      'image-package-acceptance.json',
      'image-package-acceptance.tsv',
      'image-package-delivery-receipt.md',
      'image-package-delivery-receipt.json',
      'image-package-delivery-receipt.tsv',
      'image-package-release-notes.md',
      'image-package-release-notes.json',
      'image-package-release-notes.tsv',
      'image-package-sbom.json',
      'image-package-sbom.tsv',
      'image-package-attestation.json',
      'image-package-attestation.tsv',
      'image-package-risk-register.md',
      'image-package-risk-register.json',
      'image-package-risk-register.tsv',
      'image-package-verification-summary.md',
      'image-package-verification-summary.json',
      'image-package-verification-summary.tsv',
      'image-package-client-readme.md',
      'image-package-client-readme.json',
      'image-package-change-log.md',
      'image-package-change-log.json',
      'image-package-change-log.tsv',
      'image-package-relink-map.md',
      'image-package-relink-map.json',
      'image-package-relink-map.tsv',
      'image-package-prepress-ticket.md',
      'image-package-prepress-ticket.json',
      'image-package-prepress-ticket.tsv',
      'image-package-printer-intake.md',
      'image-package-printer-intake.json',
      'image-package-printer-intake.tsv',
      'image-package-shop-proof-checklist.md',
      'image-package-shop-proof-checklist.json',
      'image-package-shop-proof-checklist.tsv',
      'image-package-production-handoff.json',
      'image-package-production-handoff.tsv',
      'image-package-print-release-approval.md',
      'image-package-print-release-approval.json',
      'image-package-print-release-approval.tsv',
      'image-package-vendor-qa.md',
      'image-package-vendor-qa.json',
      'image-package-vendor-qa.tsv',
      'image-package-press-run-ticket.md',
      'image-package-press-run-ticket.json',
      'image-package-press-run-ticket.tsv',
      'image-package-postpress-inspection.md',
      'image-package-postpress-inspection.json',
      'image-package-postpress-inspection.tsv',
      'image-package-finished-goods-release.md',
      'image-package-finished-goods-release.json',
      'image-package-finished-goods-release.tsv',
      'image-package-shipment-handoff.md',
      'image-package-shipment-handoff.json',
      'image-package-shipment-handoff.tsv',
      'image-package-delivery-confirmation.md',
      'image-package-delivery-confirmation.json',
      'image-package-delivery-confirmation.tsv',
      'image-package-release-gate.json',
      'image-package-release-gate.md',
      'image-package-release-gate.tsv',
      'verify-linked-images.sh',
      'verify-linked-images.ps1',
      'verify-package-release-gate.sh',
      'verify-package-release-gate.ps1',
    ],
    ciSteps: [
      { name: 'Verify collected Links files', shell: './verify-linked-images.sh', powershell: './verify-linked-images.ps1', required: true },
      { name: 'Verify final release gate', shell: './verify-package-release-gate.sh', powershell: './verify-package-release-gate.ps1', required: true },
      { name: 'Archive package digests', artifact: 'image-package-digests.tsv', required: true },
      { name: 'Archive release gate report', artifact: 'image-package-release-gate.md', required: true },
    ],
  };
}

function imageHandoffPackageCiManifestJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageCiManifestPayload(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ), null, 2);
}

function imageHandoffPackageGithubActionsLines(scope: string): string[] {
  return [
    'name: AnchorWorks Image Package Verification (' + scope + ')',
    '',
    'on:',
    '  workflow_dispatch:',
    '  push:',
    '    paths:',
    '      - "AnchorWorks Package/**"',
    '',
    'jobs:',
    '  verify-image-package:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout',
    '        uses: actions/checkout@v4',
    '      - name: Verify collected Links files',
    '        run: sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '      - name: Verify release gate',
    '        run: sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '      - name: Upload package QA artifacts',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: anchorworks-image-package-qa',
    '          path: |',
    '            AnchorWorks Package/image-package-ci-manifest.json',
    '            AnchorWorks Package/image-package-release-gate.json',
    '            AnchorWorks Package/image-package-release-gate.md',
    '            AnchorWorks Package/image-package-release-gate.tsv',
    '            AnchorWorks Package/image-package-audit.json',
    '            AnchorWorks Package/image-package-digests.tsv',
  ];
}

function imageHandoffPackageGithubActionsForScope(scope: string): string {
  return imageHandoffPackageGithubActionsLines(scope).join('\n');
}

function imageHandoffPackageGitlabCiLines(scope: string): string[] {
  return [
    'stages:',
    '  - verify',
    '',
    'anchorworks_image_package_verify_' + scope.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + ':',
    '  stage: verify',
    '  image: alpine:latest',
    '  script:',
    '    - sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '    - sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '  artifacts:',
    '    when: always',
    '    expire_in: 30 days',
    '    paths:',
    '      - "AnchorWorks Package/image-package-ci-manifest.json"',
    '      - "AnchorWorks Package/image-package-release-gate.json"',
    '      - "AnchorWorks Package/image-package-release-gate.md"',
    '      - "AnchorWorks Package/image-package-release-gate.tsv"',
    '      - "AnchorWorks Package/image-package-audit.json"',
    '      - "AnchorWorks Package/image-package-digests.tsv"',
  ];
}

function imageHandoffPackageGitlabCiForScope(scope: string): string {
  return imageHandoffPackageGitlabCiLines(scope).join('\n');
}

function imageHandoffPackageAzurePipelinesLines(scope: string): string[] {
  return [
    'trigger:',
    '  paths:',
    '    include:',
    '      - AnchorWorks Package/**',
    '',
    'pool:',
    '  vmImage: ubuntu-latest',
    '',
    'steps:',
    '  - checkout: self',
    '  - script: sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '    displayName: Verify collected Links files (' + scope + ')',
    '  - script: sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '    displayName: Verify release gate (' + scope + ')',
    '  - task: PublishPipelineArtifact@1',
    '    displayName: Publish AnchorWorks image package QA artifacts',
    '    inputs:',
    '      targetPath: AnchorWorks Package',
    '      artifact: anchorworks-image-package-qa',
    '      publishLocation: pipeline',
  ];
}

function imageHandoffPackageAzurePipelinesForScope(scope: string): string {
  return imageHandoffPackageAzurePipelinesLines(scope).join('\n');
}

function imageHandoffPackageCircleCiLines(scope: string): string[] {
  return [
    'version: 2.1',
    '',
    'jobs:',
    '  verify-image-package:',
    '    docker:',
    '      - image: cimg/base:stable',
    '    steps:',
    '      - checkout',
    '      - run:',
    '          name: Verify collected Links files (' + scope + ')',
    '          command: sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '      - run:',
    '          name: Verify release gate (' + scope + ')',
    '          command: sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '      - store_artifacts:',
    '          path: AnchorWorks Package',
    '          destination: anchorworks-image-package-qa',
    '',
    'workflows:',
    '  verify-image-package:',
    '    jobs:',
    '      - verify-image-package',
  ];
}

function imageHandoffPackageCircleCiForScope(scope: string): string {
  return imageHandoffPackageCircleCiLines(scope).join('\n');
}

function imageHandoffPackageJenkinsfileLines(scope: string): string[] {
  return [
    "pipeline {",
    "  agent any",
    "  stages {",
    "    stage('Verify collected Links files (" + scope + ")') {",
    "      steps {",
    "        sh 'sh \"AnchorWorks Package/verify-linked-images.sh\" \"AnchorWorks Package\"'",
    "      }",
    "    }",
    "    stage('Verify release gate (" + scope + ")') {",
    "      steps {",
    "        sh 'sh \"AnchorWorks Package/verify-package-release-gate.sh\" \"AnchorWorks Package\"'",
    "      }",
    "    }",
    "  }",
    "  post {",
    "    always {",
    "      archiveArtifacts artifacts: 'AnchorWorks Package/image-package-ci-manifest.json, AnchorWorks Package/image-package-release-gate.*, AnchorWorks Package/image-package-audit.json, AnchorWorks Package/image-package-digests.tsv', allowEmptyArchive: true",
    "    }",
    "  }",
    "}",
  ];
}

function imageHandoffPackageJenkinsfileForScope(scope: string): string {
  return imageHandoffPackageJenkinsfileLines(scope).join('\n');
}

function imageHandoffPackageBitbucketPipelinesLines(scope: string): string[] {
  return [
    'image: atlassian/default-image:4',
    '',
    'pipelines:',
    '  default:',
    '    - step:',
    '        name: Verify AnchorWorks image package (' + scope + ')',
    '        script:',
    '          - sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '          - sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '        artifacts:',
    '          - AnchorWorks Package/image-package-ci-manifest.json',
    '          - AnchorWorks Package/image-package-release-gate.json',
    '          - AnchorWorks Package/image-package-release-gate.md',
    '          - AnchorWorks Package/image-package-release-gate.tsv',
    '          - AnchorWorks Package/image-package-audit.json',
    '          - AnchorWorks Package/image-package-digests.tsv',
  ];
}

function imageHandoffPackageBitbucketPipelinesForScope(scope: string): string {
  return imageHandoffPackageBitbucketPipelinesLines(scope).join('\n');
}

function imageHandoffPackageBuildkiteLines(scope: string): string[] {
  return [
    'steps:',
    '  - label: "Verify AnchorWorks image package (' + scope + ')"',
    '    key: "verify-anchorworks-image-package"',
    '    commands:',
    '      - sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '      - sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '    artifact_paths:',
    '      - "AnchorWorks Package/image-package-ci-manifest.json"',
    '      - "AnchorWorks Package/image-package-release-gate.json"',
    '      - "AnchorWorks Package/image-package-release-gate.md"',
    '      - "AnchorWorks Package/image-package-release-gate.tsv"',
    '      - "AnchorWorks Package/image-package-audit.json"',
    '      - "AnchorWorks Package/image-package-digests.tsv"',
    '    agents:',
    '      queue: "default"',
  ];
}

function imageHandoffPackageBuildkiteForScope(scope: string): string {
  return imageHandoffPackageBuildkiteLines(scope).join('\n');
}

function imageHandoffPackageDroneLines(scope: string): string[] {
  return [
    'kind: pipeline',
    'type: docker',
    'name: anchorworks-image-package-' + scope.toLowerCase().replace(/[^a-z0-9]+/g, '-') ,
    '',
    'steps:',
    '  - name: verify-anchorworks-image-package',
    '    image: alpine:3.20',
    '    commands:',
    '      - sh "AnchorWorks Package/verify-linked-images.sh" "AnchorWorks Package"',
    '      - sh "AnchorWorks Package/verify-package-release-gate.sh" "AnchorWorks Package"',
    '',
    '  - name: publish-package-audit-artifacts',
    '    image: plugins/s3',
    '    settings:',
    '      source:',
    '        - "AnchorWorks Package/image-package-ci-manifest.json"',
    '        - "AnchorWorks Package/image-package-release-gate.json"',
    '        - "AnchorWorks Package/image-package-release-gate.md"',
    '        - "AnchorWorks Package/image-package-release-gate.tsv"',
    '        - "AnchorWorks Package/image-package-audit.json"',
    '        - "AnchorWorks Package/image-package-digests.tsv"',
    '      target: /anchorworks/image-package-audit',
    '    when:',
    '      status:',
    '        - success',
    '        - failure',
  ];
}

function imageHandoffPackageDroneForScope(scope: string): string {
  return imageHandoffPackageDroneLines(scope).join('\n');
}

function imageHandoffPackageTeamCityLines(scope: string): string[] {
  const buildId = 'AnchorWorksImagePackage' + scope.replace(/[^A-Za-z0-9]+/g, '');
  return [
    'import jetbrains.buildServer.configs.kotlin.*',
    'import jetbrains.buildServer.configs.kotlin.buildSteps.script',
    '',
    'version = "2024.12"',
    '',
    'project {',
    '  buildType(' + buildId + ')',
    '}',
    '',
    'object ' + buildId + ' : BuildType({',
    '  name = "Verify AnchorWorks image package (' + scope + ')"',
    '  description = "Runs linked-image package verification and release gate checks before delivery."',
    '',
    '  artifactRules = """',
    '    AnchorWorks Package/image-package-ci-manifest.json',
    '    AnchorWorks Package/image-package-release-gate.json',
    '    AnchorWorks Package/image-package-release-gate.md',
    '    AnchorWorks Package/image-package-release-gate.tsv',
    '    AnchorWorks Package/image-package-audit.json',
    '    AnchorWorks Package/image-package-digests.tsv',
    '  """.trimIndent()',
    '',
    '  steps {',
    '    script {',
    '      name = "Verify linked images"',
    `      scriptContent = "sh 'AnchorWorks Package/verify-linked-images.sh' 'AnchorWorks Package'"`,
    '    }',
    '    script {',
    '      name = "Verify release gate"',
    `      scriptContent = "sh 'AnchorWorks Package/verify-package-release-gate.sh' 'AnchorWorks Package'"`,
    '    }',
    '  }',
    '})',
  ];
}

function imageHandoffPackageTeamCityForScope(scope: string): string {
  return imageHandoffPackageTeamCityLines(scope).join('\n');
}

function imageHandoffPackageReleaseGatePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const packageGate = imageHandoffPackageGatePayload(summary, scope, details) as { pass?: boolean; status?: string; blockerCount?: number; blockers?: string[] };
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  const deliveryManifest = imageHandoffPackageDeliveryManifestPayload(summary, scope, details) as { readyForDelivery?: boolean; deliverables?: Array<{ name?: string; required?: boolean; ready?: boolean; note?: string }> };
  const missingRequiredDeliverables = (deliveryManifest.deliverables ?? [])
    .filter((item) => item.required === true && item.ready !== true)
    .map((item) => item.name ?? 'Unnamed deliverable');
  const checks = [
    { name: 'Package gate passed', pass: packageGate.pass === true, detail: (packageGate.status ?? 'unknown') + ' · ' + (packageGate.blockerCount ?? 0) + ' blocker(s)' },
    { name: 'Linked files verification planned', pass: (verifyManifest.expectedFileCount ?? 0) >= 0, detail: (verifyManifest.expectedFileCount ?? 0) + ' expected Links file(s)' },
    { name: 'Required deliverables ready', pass: missingRequiredDeliverables.length === 0, detail: missingRequiredDeliverables.length ? missingRequiredDeliverables.join(', ') : 'all required deliverables ready' },
    { name: 'Designer/prepress signoff completed', pass: false, detail: 'Complete image-package-signoff.md/json/tsv before final release.' },
    { name: 'Package digests reviewed', pass: false, detail: 'Compare image-package-digests.tsv with delivered package files.' },
  ];
  return {
    scope,
    generatedBy: 'AnchorWorks',
    releaseStatus: checks.every((check) => check.pass) ? 'ready' : 'hold',
    holdCount: checks.filter((check) => !check.pass).length,
    packageGate,
    expectedLinksFileCount: verifyManifest.expectedFileCount ?? 0,
    missingRequiredDeliverables,
    checks,
  };
}

function imageHandoffPackageReleaseGateJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageReleaseGatePayload(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ), null, 2);
}

function imageHandoffPackageReleaseGateRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageReleaseGatePayload(summary, scope, details) as {
    checks?: Array<{ name?: string; pass?: boolean; detail?: string }>;
  };
  return [
    'Scope\tCheck\tPass\tDetail',
    ...(payload.checks ?? []).map((check) => [
      imageHandoffTsvCell(scope),
      imageHandoffTsvCell(check.name ?? ''),
      String(check.pass ?? false),
      imageHandoffTsvCell(check.detail ?? ''),
    ].join('\t')),
  ];
}

function imageHandoffPackageReleaseGateTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageReleaseGateRows(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPackageReleaseGateLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageReleaseGatePayload(summary, scope, details) as {
    releaseStatus?: string;
    holdCount?: number;
    checks?: Array<{ name?: string; pass?: boolean; detail?: string }>;
  };
  return [
    '# AnchorWorks Image Package Release Gate (' + scope + ')',
    'Release status: ' + (payload.releaseStatus ?? 'hold') + ' · ' + (payload.holdCount ?? 0) + ' hold(s)',
    '',
    '## Checks',
    ...((payload.checks ?? []).map((check) => '- [' + (check.pass ? 'x' : ' ') + '] ' + (check.name ?? '') + ' — ' + (check.detail ?? ''))),
    '',
    (payload.releaseStatus === 'ready') ? 'Release note: package is ready for client/shop delivery.' : 'Release note: clear hold checks before final client/shop delivery.',
  ];
}

function imageHandoffPackageReleaseGateReportForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageReleaseGateLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPackageDigestRowsFromDigests(digests: Array<{ path: string; kind: string; bytes: number; digest: string }>): string[] {
  if (digests.length === 0) return ['No package files.'];
  return [
    ['Path', 'Kind', 'Bytes', 'Digest'].join('\t'),
    ...digests.map((file) => [
      imageHandoffTsvCell(file.path),
      imageHandoffTsvCell(file.kind),
      String(file.bytes),
      imageHandoffTsvCell(file.digest),
    ].join('\t')),
  ];
}

function imageHandoffPackageDigestRows(scope: string, summary: ImageLinksSummary, details: ImageHandoffDetail[]): string[] {
  const packageFiles = imageHandoffPackageBundleFiles(summary, scope, details);
  const fileIndex = JSON.parse(packageFiles.find((file) => file.path === 'image-package-file-index.json')?.content ?? '{}') as { files?: Array<{ path: string; kind: string; bytes: number; digest: string }> };
  return imageHandoffPackageDigestRowsFromDigests(fileIndex.files ?? []);
}

function imageHandoffPackageDigestManifestForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageDigestRows(
    scope,
    collectImageLinksSummary(inScope),
    collectImageHandoffDetails(inScope),
  ).join('\n');
}
function imageHandoffPackageSignoffPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const gate = imageHandoffPackageGatePayload(summary, scope, details);
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details);
  return {
    scope,
    generatedBy: 'AnchorWorks',
    gate,
    expectedLinks: verifyManifest,
    checklist: [
      'Package gate JSON reviewed.',
      'Missing/not-embeddable/unknown-source blockers resolved or accepted.',
      'collect-linked-images script run or linked images copied manually.',
      'verify-linked-images script passed against final package folder.',
      'image-package-digests.tsv compared with delivered package files.',
      'Final artwork file included with Links/ folder and reports.',
    ].map((label) => ({ label, complete: false })),
    signatures: {
      designer: { name: '', date: '' },
      prepress: { name: '', date: '' },
    },
  };
}

function imageHandoffPackageSignoffJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return JSON.stringify(imageHandoffPackageSignoffPayload(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ), null, 2);
}

function imageHandoffPackageSignoffRows(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const payload = imageHandoffPackageSignoffPayload(summary, scope, details) as {
    checklist?: Array<{ label?: string; complete?: boolean }>;
  };
  return [
    'Scope\tItem\tComplete',
    ...(payload.checklist ?? []).map((item) => [scope, item.label ?? '', String(item.complete ?? false)].join('\t')),
    [scope, 'Designer signoff', ''].join('\t'),
    [scope, 'Prepress signoff', ''].join('\t'),
  ];
}

function imageHandoffPackageSignoffTsvForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageSignoffRows(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}

function imageHandoffPackageSignoffLines(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): string[] {
  const gate = imageHandoffPackageGatePayload(summary, scope, details) as { status?: string; blockerCount?: number };
  const verifyManifest = imageHandoffVerifyManifestPayload(scope, details) as { expectedFileCount?: number };
  return [
    '# AnchorWorks Image Package Signoff (' + scope + ')',
    'Gate: ' + (gate.status ?? 'unknown') + ' · ' + (gate.blockerCount ?? 0) + ' blocker(s)',
    'Expected Links files: ' + (verifyManifest.expectedFileCount ?? 0),
    'Package files: see image-package-file-index.json',
    '',
    '## Signoff Checklist',
    '- [ ] Package gate JSON reviewed.',
    '- [ ] Missing/not-embeddable/unknown-source blockers resolved or accepted.',
    '- [ ] collect-linked-images script run or linked images copied manually.',
    '- [ ] verify-linked-images script passed against final package folder.',
    '- [ ] image-package-digests.tsv compared with delivered package files.',
    '- [ ] Final artwork file included with Links/ folder and reports.',
    '',
    'Designer signoff: ____________________  Date: __________',
    'Prepress signoff: ____________________  Date: __________',
  ];
}

function imageHandoffPackageSignoffForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  return imageHandoffPackageSignoffLines(
    collectImageLinksSummary(inScope),
    scope,
    collectImageHandoffDetails(inScope),
  ).join('\n');
}
function imageHandoffPackageBundlePayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  return {
    scope,
    generatedBy: 'AnchorWorks',
    files: imageHandoffPackageBundleFiles(summary, scope, details),
  };
}

function imageHandoffPackageBundleJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  const summary = collectImageLinksSummary(inScope);
  const details = collectImageHandoffDetails(inScope);
  return JSON.stringify(imageHandoffPackageBundlePayload(summary, scope, details), null, 2);
}

function imageHandoffPackagePlanPayload(summary: ImageLinksSummary, scope: string, details: ImageHandoffDetail[]): Record<string, unknown> {
  const riskTotal = imageHandoffPackageRiskTotal(summary);
  const groups = imageHandoffPackageGroups(details);
  return {
    scope,
    status: riskTotal === 0 ? 'ready' : 'needs review',
    riskTotal,
    summary,
    steps: {
      relinkBeforePackage: groups.missingSources,
      collectLinkedFiles: groups.collectableSources,
      collectDestinations: imageHandoffCollectDestinations(details),
      manualReviewBeforeHandoff: groups.manualReview,
      readyEmbeddedOrLinkedAssets: groups.ready,
    },
    assets: details,
  };
}

function imageHandoffPackagePlanJsonForScope(scope: string, inScope?: (object: fabric.FabricObject) => boolean): string {
  const summary = collectImageLinksSummary(inScope);
  const details = collectImageHandoffDetails(inScope);
  return JSON.stringify(imageHandoffPackagePlanPayload(summary, scope, details), null, 2);
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

export function imageHandoffActiveArtboardReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return imageHandoffRiskLines(
    inActiveArtboard ? collectImageLinksSummary(inActiveArtboard) : emptyImageLinksSummary(),
    'Active artboard',
    inActiveArtboard ? collectImageHandoffDetails(inActiveArtboard) : [],
  ).join('\n');
}

export function imageHandoffTsvReport(): string {
  return imageHandoffTsvRows(collectImageHandoffDetails()).join('\n');
}

export function imageHandoffActiveArtboardTsvReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return imageHandoffTsvRows(inActiveArtboard ? collectImageHandoffDetails(inActiveArtboard) : []).join('\n');
}

export function imageHandoffJsonReport(): string {
  return imageHandoffJsonReportForScope('Document');
}

export function imageHandoffActiveArtboardJsonReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard
    ? imageHandoffJsonReportForScope('Active artboard', inActiveArtboard)
    : JSON.stringify(imageHandoffJsonPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffSourceManifest(): string {
  return imageHandoffManifestReportForScope('Document');
}

export function imageHandoffActiveArtboardSourceManifest(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffManifestReportForScope('Active artboard', inActiveArtboard) : imageHandoffManifestLines('Active artboard', []).join('\n');
}

export function imageHandoffCollectSourceList(): string {
  return imageHandoffCollectSourceListForScope();
}

export function imageHandoffActiveArtboardCollectSourceList(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffCollectSourceListForScope(inActiveArtboard) : imageHandoffCollectSourceListLines([]).join('\n');
}

export function imageHandoffMissingRelinkList(): string {
  return imageHandoffMissingRelinkListForScope();
}

export function imageHandoffActiveArtboardMissingRelinkList(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffMissingRelinkListForScope(inActiveArtboard) : imageHandoffMissingRelinkListLines([]).join('\n');
}

export function imageHandoffPackageChecklist(): string {
  return imageHandoffPackageChecklistForScope('Document');
}

export function imageHandoffActiveArtboardPackageChecklist(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard
    ? imageHandoffPackageChecklistForScope('Active artboard', inActiveArtboard)
    : imageHandoffPackageChecklistLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePlanJson(): string {
  return imageHandoffPackagePlanJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePlanJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard
    ? imageHandoffPackagePlanJsonForScope('Active artboard', inActiveArtboard)
    : JSON.stringify(imageHandoffPackagePlanPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffCollectDestinationManifest(): string {
  return imageHandoffCollectDestinationManifestForScope();
}

export function imageHandoffActiveArtboardCollectDestinationManifest(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffCollectDestinationManifestForScope(inActiveArtboard) : imageHandoffCollectDestinationRows([]).join('\n');
}

export function imageHandoffCollectScript(): string {
  return imageHandoffCollectScriptForScope('Document');
}

export function imageHandoffActiveArtboardCollectScript(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffCollectScriptForScope('Active artboard', inActiveArtboard) : imageHandoffCollectScriptLines('Active artboard', []).join('\n');
}

export function imageHandoffCollectPowerShell(): string {
  return imageHandoffCollectPowerShellForScope('Document');
}

export function imageHandoffActiveArtboardCollectPowerShell(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffCollectPowerShellForScope('Active artboard', inActiveArtboard) : imageHandoffCollectPowerShellLines('Active artboard', []).join('\n');
}

export function imageHandoffVerifyScript(): string {
  return imageHandoffVerifyScriptForScope('Document');
}

export function imageHandoffActiveArtboardVerifyScript(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffVerifyScriptForScope('Active artboard', inActiveArtboard) : imageHandoffVerifyScriptLines('Active artboard', []).join('\n');
}

export function imageHandoffVerifyPowerShell(): string {
  return imageHandoffVerifyPowerShellForScope('Document');
}

export function imageHandoffActiveArtboardVerifyPowerShell(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffVerifyPowerShellForScope('Active artboard', inActiveArtboard) : imageHandoffVerifyPowerShellLines('Active artboard', []).join('\n');
}
export function imageHandoffVerifyManifestJson(): string {
  return imageHandoffVerifyManifestJsonForScope('Document');
}

export function imageHandoffActiveArtboardVerifyManifestJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffVerifyManifestJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffVerifyManifestPayload('Active artboard', []), null, 2);
}
export function imageHandoffPackageFileIndexJson(): string {
  return imageHandoffPackageFileIndexJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageFileIndexJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageFileIndexJsonForScope('Active artboard', inActiveArtboard) : imageHandoffPackageFileIndexJsonForScope('Active artboard', () => false);
}
export function imageHandoffPackageAuditJson(): string {
  return imageHandoffPackageAuditJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageAuditJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAuditJsonForScope('Active artboard', inActiveArtboard) : imageHandoffPackageAuditJsonForScope('Active artboard', () => false);
}
export function imageHandoffPackageAuditReport(): string {
  return imageHandoffPackageAuditReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageAuditReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAuditReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageAuditLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}
export function imageHandoffPackageDigestManifest(): string {
  return imageHandoffPackageDigestManifestForScope('Document');
}

export function imageHandoffActiveArtboardPackageDigestManifest(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDigestManifestForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDigestRows('Active artboard', emptyImageLinksSummary(), []).join('\n');
}
export function imageHandoffPackageSignoff(): string {
  return imageHandoffPackageSignoffForScope('Document');
}

export function imageHandoffActiveArtboardPackageSignoff(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageSignoffForScope('Active artboard', inActiveArtboard) : imageHandoffPackageSignoffLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}
export function imageHandoffPackageSignoffJson(): string {
  return imageHandoffPackageSignoffJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageSignoffJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageSignoffJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageSignoffPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageSignoffTsv(): string {
  return imageHandoffPackageSignoffTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageSignoffTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageSignoffTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageSignoffRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageDeliveryManifestJson(): string {
  return imageHandoffPackageDeliveryManifestJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryManifestJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryManifestJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageDeliveryManifestPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageDeliveryManifestTsv(): string {
  return imageHandoffPackageDeliveryManifestTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryManifestTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryManifestTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDeliveryManifestRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageProvenanceJson(): string {
  return imageHandoffPackageProvenanceJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageProvenanceJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageProvenanceJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageProvenancePayload('Active artboard', []), null, 2);
}

export function imageHandoffPackageProvenanceTsv(): string {
  return imageHandoffPackageProvenanceTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageProvenanceTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageProvenanceTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageProvenanceRows('Active artboard', []).join('\n');
}

export function imageHandoffPackageRightsManifestReport(): string {
  return imageHandoffPackageRightsManifestReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageRightsManifestReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRightsManifestReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRightsManifestLines('Active artboard', []).join('\n');
}

export function imageHandoffPackageRightsManifestJson(): string {
  return imageHandoffPackageRightsManifestJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageRightsManifestJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRightsManifestJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageRightsManifestPayload('Active artboard', []), null, 2);
}

export function imageHandoffPackageRightsManifestTsv(): string {
  return imageHandoffPackageRightsManifestTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageRightsManifestTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRightsManifestTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRightsManifestRows('Active artboard', []).join('\n');
}

export function imageHandoffPackageAcceptanceJson(): string {
  return imageHandoffPackageAcceptanceJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageAcceptanceJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAcceptanceJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageAcceptancePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageAcceptanceTsv(): string {
  return imageHandoffPackageAcceptanceTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageAcceptanceTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAcceptanceTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageAcceptanceRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageDeliveryReceiptReport(): string {
  return imageHandoffPackageDeliveryReceiptReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryReceiptReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryReceiptReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDeliveryReceiptLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageDeliveryReceiptJson(): string {
  return imageHandoffPackageDeliveryReceiptJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryReceiptJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryReceiptJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageDeliveryReceiptPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageDeliveryReceiptTsv(): string {
  return imageHandoffPackageDeliveryReceiptTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryReceiptTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryReceiptTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDeliveryReceiptRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageReleaseNotesReport(): string {
  return imageHandoffPackageReleaseNotesReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseNotesReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseNotesReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageReleaseNotesLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageReleaseNotesJson(): string {
  return imageHandoffPackageReleaseNotesJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseNotesJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseNotesJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageReleaseNotesPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageReleaseNotesTsv(): string {
  return imageHandoffPackageReleaseNotesTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseNotesTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseNotesTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageReleaseNotesRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageSbomJson(): string {
  return imageHandoffPackageSbomJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageSbomJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageSbomJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageSbomPayload('Active artboard', []), null, 2);
}

export function imageHandoffPackageSbomTsv(): string {
  return imageHandoffPackageSbomTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageSbomTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageSbomTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageSbomRows('Active artboard', []).join('\n');
}

export function imageHandoffPackageAttestationJson(): string {
  return imageHandoffPackageAttestationJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageAttestationJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAttestationJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageAttestationPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageAttestationTsv(): string {
  return imageHandoffPackageAttestationTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageAttestationTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageAttestationTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageAttestationRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageRiskRegisterReport(): string {
  return imageHandoffPackageRiskRegisterReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageRiskRegisterReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRiskRegisterReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRiskRegisterLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageRiskRegisterJson(): string {
  return imageHandoffPackageRiskRegisterJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageRiskRegisterJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRiskRegisterJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageRiskRegisterPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageRiskRegisterTsv(): string {
  return imageHandoffPackageRiskRegisterTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageRiskRegisterTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRiskRegisterTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRiskRegisterRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageVerificationSummaryReport(): string {
  return imageHandoffPackageVerificationSummaryReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageVerificationSummaryReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVerificationSummaryReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageVerificationSummaryLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageVerificationSummaryJson(): string {
  return imageHandoffPackageVerificationSummaryJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageVerificationSummaryJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVerificationSummaryJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageVerificationSummaryPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageVerificationSummaryTsv(): string {
  return imageHandoffPackageVerificationSummaryTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageVerificationSummaryTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVerificationSummaryTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageVerificationSummaryRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageClientReadme(): string {
  return imageHandoffPackageClientReadmeForScope('Document');
}

export function imageHandoffActiveArtboardPackageClientReadme(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageClientReadmeForScope('Active artboard', inActiveArtboard) : imageHandoffPackageClientReadmeLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageClientReadmeJson(): string {
  return imageHandoffPackageClientReadmeJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageClientReadmeJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageClientReadmeJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageClientReadmePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageChangeLogReport(): string {
  return imageHandoffPackageChangeLogReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageChangeLogReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageChangeLogReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageChangeLogLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageChangeLogJson(): string {
  return imageHandoffPackageChangeLogJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageChangeLogJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageChangeLogJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageChangeLogPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageChangeLogTsv(): string {
  return imageHandoffPackageChangeLogTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageChangeLogTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageChangeLogTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageChangeLogRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageRelinkMapReport(): string {
  return imageHandoffPackageRelinkMapReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageRelinkMapReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRelinkMapReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRelinkMapLines('Active artboard', []).join('\n');
}

export function imageHandoffPackageRelinkMapJson(): string {
  return imageHandoffPackageRelinkMapJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageRelinkMapJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRelinkMapJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageRelinkMapPayload('Active artboard', []), null, 2);
}

export function imageHandoffPackageRelinkMapTsv(): string {
  return imageHandoffPackageRelinkMapTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageRelinkMapTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageRelinkMapTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageRelinkMapRows('Active artboard', []).join('\n');
}

export function imageHandoffPackagePrepressTicketReport(): string {
  return imageHandoffPackagePrepressTicketReportForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrepressTicketReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrepressTicketReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrepressTicketLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePrepressTicketJson(): string {
  return imageHandoffPackagePrepressTicketJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrepressTicketJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrepressTicketJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackagePrepressTicketPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackagePrepressTicketTsv(): string {
  return imageHandoffPackagePrepressTicketTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrepressTicketTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrepressTicketTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrepressTicketRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePrinterIntakeReport(): string {
  return imageHandoffPackagePrinterIntakeReportForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrinterIntakeReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrinterIntakeReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrinterIntakeLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePrinterIntakeJson(): string {
  return imageHandoffPackagePrinterIntakeJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrinterIntakeJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrinterIntakeJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackagePrinterIntakePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackagePrinterIntakeTsv(): string {
  return imageHandoffPackagePrinterIntakeTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrinterIntakeTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrinterIntakeTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrinterIntakeRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageShopProofChecklistReport(): string {
  return imageHandoffPackageShopProofChecklistReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageShopProofChecklistReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShopProofChecklistReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageShopProofChecklistLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageShopProofChecklistJson(): string {
  return imageHandoffPackageShopProofChecklistJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageShopProofChecklistJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShopProofChecklistJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageShopProofChecklistPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageShopProofChecklistTsv(): string {
  return imageHandoffPackageShopProofChecklistTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageShopProofChecklistTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShopProofChecklistTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageShopProofChecklistRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageProductionHandoffJson(): string {
  return imageHandoffPackageProductionHandoffJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageProductionHandoffJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageProductionHandoffJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageProductionHandoffPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageProductionHandoffTsv(): string {
  return imageHandoffPackageProductionHandoffTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageProductionHandoffTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageProductionHandoffTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageProductionHandoffRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePrintReleaseApprovalReport(): string {
  return imageHandoffPackagePrintReleaseApprovalReportForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrintReleaseApprovalReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrintReleaseApprovalReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrintReleaseApprovalLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePrintReleaseApprovalJson(): string {
  return imageHandoffPackagePrintReleaseApprovalJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrintReleaseApprovalJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrintReleaseApprovalJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackagePrintReleaseApprovalPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackagePrintReleaseApprovalTsv(): string {
  return imageHandoffPackagePrintReleaseApprovalTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackagePrintReleaseApprovalTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePrintReleaseApprovalTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePrintReleaseApprovalRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageVendorQaReport(): string {
  return imageHandoffPackageVendorQaReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageVendorQaReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVendorQaReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageVendorQaLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageVendorQaJson(): string {
  return imageHandoffPackageVendorQaJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageVendorQaJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVendorQaJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageVendorQaPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageVendorQaTsv(): string {
  return imageHandoffPackageVendorQaTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageVendorQaTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageVendorQaTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageVendorQaRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePressRunTicketReport(): string {
  return imageHandoffPackagePressRunTicketReportForScope('Document');
}

export function imageHandoffActiveArtboardPackagePressRunTicketReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePressRunTicketReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePressRunTicketLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePressRunTicketJson(): string {
  return imageHandoffPackagePressRunTicketJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePressRunTicketJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePressRunTicketJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackagePressRunTicketPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackagePressRunTicketTsv(): string {
  return imageHandoffPackagePressRunTicketTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackagePressRunTicketTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePressRunTicketTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePressRunTicketRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePostpressInspectionReport(): string {
  return imageHandoffPackagePostpressInspectionReportForScope('Document');
}

export function imageHandoffActiveArtboardPackagePostpressInspectionReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePostpressInspectionReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePostpressInspectionLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackagePostpressInspectionJson(): string {
  return imageHandoffPackagePostpressInspectionJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackagePostpressInspectionJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePostpressInspectionJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackagePostpressInspectionPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackagePostpressInspectionTsv(): string {
  return imageHandoffPackagePostpressInspectionTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackagePostpressInspectionTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackagePostpressInspectionTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackagePostpressInspectionRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageFinishedGoodsReleaseReport(): string {
  return imageHandoffPackageFinishedGoodsReleaseReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageFinishedGoodsReleaseReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageFinishedGoodsReleaseReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageFinishedGoodsReleaseLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageFinishedGoodsReleaseJson(): string {
  return imageHandoffPackageFinishedGoodsReleaseJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageFinishedGoodsReleaseJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageFinishedGoodsReleaseJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageFinishedGoodsReleasePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageFinishedGoodsReleaseTsv(): string {
  return imageHandoffPackageFinishedGoodsReleaseTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageFinishedGoodsReleaseTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageFinishedGoodsReleaseTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageFinishedGoodsReleaseRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageShipmentHandoffReport(): string {
  return imageHandoffPackageShipmentHandoffReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageShipmentHandoffReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShipmentHandoffReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageShipmentHandoffLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageShipmentHandoffJson(): string {
  return imageHandoffPackageShipmentHandoffJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageShipmentHandoffJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShipmentHandoffJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageShipmentHandoffPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageShipmentHandoffTsv(): string {
  return imageHandoffPackageShipmentHandoffTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageShipmentHandoffTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageShipmentHandoffTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageShipmentHandoffRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageDeliveryConfirmationReport(): string {
  return imageHandoffPackageDeliveryConfirmationReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryConfirmationReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryConfirmationReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDeliveryConfirmationLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageDeliveryConfirmationJson(): string {
  return imageHandoffPackageDeliveryConfirmationJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryConfirmationJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryConfirmationJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageDeliveryConfirmationPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageDeliveryConfirmationTsv(): string {
  return imageHandoffPackageDeliveryConfirmationTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageDeliveryConfirmationTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageDeliveryConfirmationTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageDeliveryConfirmationRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageReleaseGateJson(): string {
  return imageHandoffPackageReleaseGateJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseGateJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseGateJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageReleaseGatePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageReleaseGateReport(): string {
  return imageHandoffPackageReleaseGateReportForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseGateReport(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseGateReportForScope('Active artboard', inActiveArtboard) : imageHandoffPackageReleaseGateLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageReleaseGateTsv(): string {
  return imageHandoffPackageReleaseGateTsvForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseGateTsv(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReleaseGateTsvForScope('Active artboard', inActiveArtboard) : imageHandoffPackageReleaseGateRows(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageReleaseGateVerifyScript(): string {
  return imageHandoffPackageReleaseGateVerifyScriptForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseGateVerifyScript(): string {
  return imageHandoffPackageReleaseGateVerifyScriptForScope('Active artboard');
}

export function imageHandoffPackageReleaseGateVerifyPowerShell(): string {
  return imageHandoffPackageReleaseGateVerifyPowerShellForScope('Document');
}

export function imageHandoffActiveArtboardPackageReleaseGateVerifyPowerShell(): string {
  return imageHandoffPackageReleaseGateVerifyPowerShellForScope('Active artboard');
}

export function imageHandoffPackageCiManifestJson(): string {
  return imageHandoffPackageCiManifestJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageCiManifestJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageCiManifestJsonForScope('Active artboard', inActiveArtboard) : JSON.stringify(imageHandoffPackageCiManifestPayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageGithubActionsWorkflow(): string {
  return imageHandoffPackageGithubActionsForScope('Document');
}

export function imageHandoffActiveArtboardPackageGithubActionsWorkflow(): string {
  return imageHandoffPackageGithubActionsForScope('Active artboard');
}

export function imageHandoffPackageGitlabCiWorkflow(): string {
  return imageHandoffPackageGitlabCiForScope('Document');
}

export function imageHandoffActiveArtboardPackageGitlabCiWorkflow(): string {
  return imageHandoffPackageGitlabCiForScope('Active artboard');
}

export function imageHandoffPackageAzurePipelinesWorkflow(): string {
  return imageHandoffPackageAzurePipelinesForScope('Document');
}

export function imageHandoffActiveArtboardPackageAzurePipelinesWorkflow(): string {
  return imageHandoffPackageAzurePipelinesForScope('Active artboard');
}

export function imageHandoffPackageCircleCiWorkflow(): string {
  return imageHandoffPackageCircleCiForScope('Document');
}

export function imageHandoffActiveArtboardPackageCircleCiWorkflow(): string {
  return imageHandoffPackageCircleCiForScope('Active artboard');
}

export function imageHandoffPackageJenkinsfile(): string {
  return imageHandoffPackageJenkinsfileForScope('Document');
}

export function imageHandoffActiveArtboardPackageJenkinsfile(): string {
  return imageHandoffPackageJenkinsfileForScope('Active artboard');
}

export function imageHandoffPackageBitbucketPipelinesWorkflow(): string {
  return imageHandoffPackageBitbucketPipelinesForScope('Document');
}

export function imageHandoffActiveArtboardPackageBitbucketPipelinesWorkflow(): string {
  return imageHandoffPackageBitbucketPipelinesForScope('Active artboard');
}

export function imageHandoffPackageBuildkiteWorkflow(): string {
  return imageHandoffPackageBuildkiteForScope('Document');
}

export function imageHandoffActiveArtboardPackageBuildkiteWorkflow(): string {
  return imageHandoffPackageBuildkiteForScope('Active artboard');
}

export function imageHandoffPackageDroneWorkflow(): string {
  return imageHandoffPackageDroneForScope('Document');
}

export function imageHandoffActiveArtboardPackageDroneWorkflow(): string {
  return imageHandoffPackageDroneForScope('Active artboard');
}

export function imageHandoffPackageTeamCityWorkflow(): string {
  return imageHandoffPackageTeamCityForScope('Document');
}

export function imageHandoffActiveArtboardPackageTeamCityWorkflow(): string {
  return imageHandoffPackageTeamCityForScope('Active artboard');
}

export function imageHandoffPackageReadme(): string {
  return imageHandoffPackageReadmeForScope('Document');
}

export function imageHandoffActiveArtboardPackageReadme(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageReadmeForScope('Active artboard', inActiveArtboard) : imageHandoffPackageReadmeLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageTree(): string {
  return imageHandoffPackageTreeForScope('Document');
}

export function imageHandoffActiveArtboardPackageTree(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageTreeForScope('Active artboard', inActiveArtboard) : imageHandoffPackageTreeLines('Active artboard', []).join('\n');
}

export function imageHandoffPackageBundleJson(): string {
  return imageHandoffPackageBundleJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageBundleJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard
    ? imageHandoffPackageBundleJsonForScope('Active artboard', inActiveArtboard)
    : JSON.stringify(imageHandoffPackageBundlePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

export function imageHandoffPackageBlockers(): string {
  return imageHandoffPackageBlockersForScope('Document');
}

export function imageHandoffActiveArtboardPackageBlockers(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? imageHandoffPackageBlockersForScope('Active artboard', inActiveArtboard) : imageHandoffPackageBlockerLines(emptyImageLinksSummary(), 'Active artboard', []).join('\n');
}

export function imageHandoffPackageGateJson(): string {
  return imageHandoffPackageGateJsonForScope('Document');
}

export function imageHandoffActiveArtboardPackageGateJson(): string {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard
    ? imageHandoffPackageGateJsonForScope('Active artboard', inActiveArtboard)
    : JSON.stringify(imageHandoffPackageGatePayload(emptyImageLinksSummary(), 'Active artboard', []), null, 2);
}

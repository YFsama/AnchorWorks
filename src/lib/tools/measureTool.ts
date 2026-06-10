/**
 * Measure tool — click-drag to read distance + angle between two points, like
 * Illustrator's Measure tool / SignMaster's dimension readout. The live
 * segment lives in the editor store (`measure`, scene coords) and is drawn by
 * MeasureLayer; the numeric readout is shown on the segment + in the overlay.
 * The live overlay is non-destructive; users can pin it as an editable dimension annotation when needed.
 */
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import { getCanvas, pushHistory } from '../canvasEngine';
import { arrowTriangle } from '../arrowheads';
import { createPrintMarkObjects } from '../printMarks';
import { generateRegMarks, generateWeedBorder, generateWeedLines } from '../cutContour';
import { grommetsFromObjects } from '../grommets';
import { addBridges } from '../bridges';
import { rhinestoneFromSelection } from '../rhinestone';

const MM_TO_PX = 3.7795;
const MEASURE_ANNOTATION_KIND = 'measure-annotation';

type MeasureAnnotationObject = fabric.FabricObject & { measureAnnotationKind?: string };
type MeasureProofMarkObject = fabric.FabricObject & { measureProofMarkKind?: string };
type MeasureProofLabelObject = fabric.FabricObject & { measureProofLabelKind?: string };
type MeasureProofFrameObject = fabric.FabricObject & { measureProofFrameKind?: string };
type MeasureProofLegendObject = fabric.FabricObject & { measureProofLegendKind?: string };
type MeasureProofSignoff = { signer?: string; date?: string; note?: string };
type MeasureProofChecklistState = 'empty' | 'checked' | 'issue';
type MeasureProofChecklistObject = fabric.FabricObject & { measureProofChecklistKind?: string; measureProofSignoff?: MeasureProofSignoff; measureProofChecklistStatus?: MeasureProofApprovalStatus; measureProofChecklistStates?: MeasureProofChecklistState[] };
type MeasureProofColorBarObject = fabric.FabricObject & { measureProofColorBarKind?: string };
type MeasureProofScaleObject = fabric.FabricObject & { measureProofScaleKind?: string };
type MeasureProofJobInfo = { job?: string; revision?: string; prepared?: string; notes?: string };
type MeasureProofJobInfoObject = fabric.FabricObject & { measureProofJobInfoKind?: string; measureProofJobInfoPage?: number; measureProofJobInfo?: MeasureProofJobInfo };
type MeasureProofFilenameObject = fabric.FabricObject & { measureProofFilenameKind?: string; measureProofFilenamePage?: number; measureProofFilename?: string };
type MeasureProofPreflightObject = fabric.FabricObject & { measureProofPreflightKind?: string; measureProofPreflightPage?: number; measureProofPreflightStatus?: MeasureProofApprovalStatus; measureProofPreflightFilename?: string };
type MeasureProofManifestObject = fabric.FabricObject & { measureProofManifestKind?: string };
type MeasureProofRevisionObject = fabric.FabricObject & { measureProofRevisionKind?: string };
type MeasureProofAuditObject = fabric.FabricObject & { measureProofAuditKind?: string };
type MeasureProofCoverObject = fabric.FabricObject & { measureProofCoverKind?: string };
type MeasureProofDeliveryObject = fabric.FabricObject & { measureProofDeliveryKind?: string };
type MeasureProofReleaseObject = fabric.FabricObject & { measureProofReleaseKind?: string };
type MeasureProofIndexObject = fabric.FabricObject & { measureProofIndexKind?: string };
type MeasureProofContact = { client?: string; contact?: string; email?: string; phone?: string };
type MeasureProofContactObject = fabric.FabricObject & { measureProofContactKind?: string; measureProofContact?: MeasureProofContact };
type MeasureProofSchedule = { due?: string; ship?: string; method?: string; notes?: string };
type MeasureProofScheduleObject = fabric.FabricObject & { measureProofScheduleKind?: string; measureProofSchedule?: MeasureProofSchedule };
type MeasureProofRoute = { carrier?: string; service?: string; account?: string; address?: string };
type MeasureProofRouteObject = fabric.FabricObject & { measureProofRouteKind?: string; measureProofRoute?: MeasureProofRoute };
type MeasureProofFulfillment = { quantity?: string; packaging?: string; owner?: string; tracking?: string };
type MeasureProofFulfillmentObject = fabric.FabricObject & { measureProofFulfillmentKind?: string; measureProofFulfillment?: MeasureProofFulfillment };
type MeasureProofInstall = { installer?: string; date?: string; site?: string; notes?: string };
type MeasureProofInstallObject = fabric.FabricObject & { measureProofInstallKind?: string; measureProofInstall?: MeasureProofInstall };
type MeasureProofSiteReadiness = { permit?: string; access?: string; power?: string; risks?: string };
type MeasureProofSiteReadinessObject = fabric.FabricObject & { measureProofSiteReadinessKind?: string; measureProofSiteReadiness?: MeasureProofSiteReadiness };
type MeasureProofPunchList = { open?: string; owner?: string; due?: string; resolution?: string };
type MeasureProofPunchListObject = fabric.FabricObject & { measureProofPunchListKind?: string; measureProofPunchList?: MeasureProofPunchList };
type MeasureProofAcceptance = { acceptedBy?: string; date?: string; status?: string; notes?: string };
type MeasureProofAcceptanceObject = fabric.FabricObject & { measureProofAcceptanceKind?: string; measureProofAcceptance?: MeasureProofAcceptance };
type MeasureProofWarranty = { term?: string; coverage?: string; contact?: string; notes?: string };
type MeasureProofWarrantyObject = fabric.FabricObject & { measureProofWarrantyKind?: string; measureProofWarranty?: MeasureProofWarranty };
type MeasureProofCare = { cleaning?: string; chemicals?: string; inspection?: string; notes?: string };
type MeasureProofCareObject = fabric.FabricObject & { measureProofCareKind?: string; measureProofCare?: MeasureProofCare };
type MeasureProofArchive = { source?: string; exports?: string; photos?: string; notes?: string };
type MeasureProofArchiveObject = fabric.FabricObject & { measureProofArchiveKind?: string; measureProofArchive?: MeasureProofArchive };
type MeasureProofVerification = { version?: string; checksum?: string; reviewed?: string; notes?: string };
type MeasureProofVerificationObject = fabric.FabricObject & { measureProofVerificationKind?: string; measureProofVerification?: MeasureProofVerification };
type MeasureProofSpecsObject = fabric.FabricObject & { measureProofSpecsKind?: string };
type MeasureProofSafetyObject = fabric.FabricObject & { measureProofSafetyKind?: string };
type MeasureProofApprovalStatus = 'draft' | 'approved' | 'changes';
type MeasureProofApprovalObject = fabric.FabricObject & { measureProofApprovalKind?: string; measureProofApprovalStatus?: MeasureProofApprovalStatus; measureProofApprovalPage?: number };

function tagMeasureAnnotation<T extends fabric.FabricObject>(object: T): T {
  (object as MeasureAnnotationObject).measureAnnotationKind = MEASURE_ANNOTATION_KIND;
  return object;
}


let dragging = false;
let startX = 0;
let startY = 0;

export function measureBegin(x: number, y: number): void {
  dragging = true;
  startX = x; startY = y;
  useEditor.getState().setMeasure({ x1: x, y1: y, x2: x, y2: y });
}

export function measureUpdate(x: number, y: number): void {
  if (!dragging) return;
  useEditor.getState().setMeasure({ x1: startX, y1: startY, x2: x, y2: y });
}

export function measureEnd(): void {
  dragging = false; // keep the last segment visible until the tool changes
}

/** Tool deactivation — drop the segment so it doesn't linger under other tools. */
export function measureClear(): void {
  dragging = false;
  useEditor.getState().setMeasure(null);
}

/**
 * Commit the live measurement as a persistent dimension annotation — a grouped
 * line + mm label dropped on the canvas (selectable, exportable), so a shop
 * drawing keeps its measurements. Clears the live segment. Returns false when
 * there's nothing to commit.
 */
function dimensionAnnotationObjects(m: { x1: number; y1: number; x2: number; y2: number }, label?: string): fabric.FabricObject[] {
  const distMm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) / MM_TO_PX;
  if (distMm < 0.1) return [];
  const line = new fabric.Line([m.x1, m.y1, m.x2, m.y2], { stroke: '#22d3ee', strokeWidth: 1 });
  const dir: [number, number] = [m.x2 - m.x1, m.y2 - m.y1];
  const mkHead = (tri: [number, number][]) =>
    new fabric.Polygon(tri.map(([x, y]) => ({ x, y })), { fill: '#22d3ee', stroke: '', strokeWidth: 0 });
  const headEnd = mkHead(arrowTriangle([m.x2, m.y2], dir, 10, 7));
  const headStart = mkHead(arrowTriangle([m.x1, m.y1], [-dir[0], -dir[1]], 10, 7));
  const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const labelObject = new fabric.Text(label ?? `${distMm.toFixed(1)} mm`, {
    left: (m.x1 + m.x2) / 2 + normalX * -12, top: (m.y1 + m.y2) / 2 + normalY * -12,
    originX: 'center', originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
    angle: (angle * 180) / Math.PI,
    fill: '#22d3ee', backgroundColor: 'rgba(11,18,32,0.85)',
  });
  return [line, headStart, headEnd, labelObject];
}


function selectionBounds(objects: fabric.FabricObject[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  if (objects.length === 0) return null;
  const rects = objects.map((object) => object.getBoundingRect());
  const minX = Math.min(...rects.map((rect) => rect.left));
  const minY = Math.min(...rects.map((rect) => rect.top));
  const maxX = Math.max(...rects.map((rect) => rect.left + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.top + rect.height));
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width / MM_TO_PX < 0.1 || height / MM_TO_PX < 0.1) return null;
  return { minX, minY, maxX, maxY, width, height };
}


function selectionDimensionObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const { minX, minY, maxX, maxY, width, height } = bounds;
  const offset = 24;
  const tick = 8;
  const horizontalY = maxY + offset;
  const verticalX = maxX + offset;
  return [
    new fabric.Line([minX, maxY, minX, horizontalY + tick], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([maxX, maxY, maxX, horizontalY + tick], { stroke: '#22d3ee', strokeWidth: 1 }),
    ...dimensionAnnotationObjects({ x1: minX, y1: horizontalY, x2: maxX, y2: horizontalY }, `W ${(width / MM_TO_PX).toFixed(1)} mm`),
    new fabric.Line([maxX, minY, verticalX + tick, minY], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([maxX, maxY, verticalX + tick, maxY], { stroke: '#22d3ee', strokeWidth: 1 }),
    ...dimensionAnnotationObjects({ x1: verticalX, y1: maxY, x2: verticalX, y2: minY }, `H ${(height / MM_TO_PX).toFixed(1)} mm`),
  ];
}

function proofPageFrameObjects(proofBounds: { left: number; top: number; width: number; height: number }, artworkBounds: NonNullable<ReturnType<typeof selectionBounds>> | { minX: number; minY: number; width: number; height: number }): fabric.FabricObject[] {
  const trimFrame = new fabric.Rect({
    left: proofBounds.left,
    top: proofBounds.top,
    width: proofBounds.width,
    height: proofBounds.height,
    fill: '',
    stroke: '#0f172a',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    objectCaching: false,
  });
  const artworkFrame = new fabric.Rect({
    left: artworkBounds.minX,
    top: artworkBounds.minY,
    width: artworkBounds.width,
    height: artworkBounds.height,
    fill: '',
    stroke: '#22d3ee',
    strokeWidth: 1,
    strokeDashArray: [3, 3],
    objectCaching: false,
  });
  const frames = [trimFrame, artworkFrame];
  for (const [index, frame] of frames.entries()) {
    const proofFrame = frame as MeasureProofFrameObject & { name?: string };
    proofFrame.measureProofFrameKind = index === 0 ? 'trim' : 'artwork';
    proofFrame.name = index === 0 ? 'Measure Proof Trim Frame' : 'Measure Proof Artwork Frame';
    proofFrame.excludeFromExport = false;
  }
  return frames;
}

function proofPageLegendObject(bounds: { left: number; top: number; width: number; height: number }, bleedMm: number): fabric.Group {
  const entries = [
    { label: 'Trim/page frame', color: '#0f172a', dash: [6, 4] },
    { label: 'Artwork bounds', color: '#22d3ee', dash: [3, 3] },
    { label: `Bleed ${bleedMm.toFixed(1)} mm`, color: '#e11d48', dash: [5, 3] },
  ];
  const objects: fabric.FabricObject[] = [];
  for (const [index, entry] of entries.entries()) {
    const y = index * 16;
    objects.push(
      new fabric.Line([0, y + 7, 24, y + 7], { stroke: entry.color, strokeWidth: 1, strokeDashArray: entry.dash }),
      new fabric.FabricText(entry.label, {
        left: 32,
        top: y,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fill: '#0f172a',
      }),
    );
  }
  const group = new fabric.Group(objects, {
    left: bounds.left,
    top: bounds.top + bounds.height + 34,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const legend = group as MeasureProofLegendObject & { name?: string };
  legend.measureProofLegendKind = 'measure-proof-legend';
  legend.name = 'Measure Proof Legend';
  legend.excludeFromExport = false;
  return group;
}

function tagMeasureProofMarks(objects: fabric.FabricObject[]): fabric.FabricObject[] {
  for (const object of objects) {
    const proofMark = object as MeasureProofMarkObject & { name?: string };
    proofMark.measureProofMarkKind = 'measure-proof-mark';
    proofMark.name = proofMark.name ?? 'Measure Proof Print Mark';
  }
  return objects;
}

function measureProofPageCount(): number {
  const pages = new Set<number>();
  let filenameCount = 0;
  for (const object of measureProofSheetObjects()) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalPage) pages.add(approval.measureProofApprovalPage);
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename') filenameCount += 1;
  }
  return pages.size || filenameCount;
}

function measureProofStatusCounts(): Map<MeasureProofApprovalStatus, number> {
  const statuses = new Map<MeasureProofApprovalStatus, number>([['draft', 0], ['approved', 0], ['changes', 0]]);
  for (const object of measureProofSheetObjects()) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp') {
      const status = approval.measureProofApprovalStatus ?? 'draft';
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
    }
  }
  return statuses;
}

function measureProofSignoffCount(): number {
  let signedCount = 0;
  for (const object of measureProofSheetObjects()) {
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist' && checklist.measureProofSignoff?.signer && checklist.measureProofSignoff?.date) signedCount += 1;
  }
  return signedCount;
}

function measureProofUnsignedCount(): number {
  let unsignedCount = 0;
  for (const object of measureProofSheetObjects()) {
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist' && (!checklist.measureProofSignoff?.signer || !checklist.measureProofSignoff?.date)) unsignedCount += 1;
  }
  return unsignedCount;
}

function measureProofJobInfo(): MeasureProofJobInfo {
  for (const object of measureProofSheetObjects()) {
    const jobInfo = object as MeasureProofJobInfoObject;
    if (jobInfo.measureProofJobInfoKind === 'measure-proof-job-info' && jobInfo.measureProofJobInfo) return jobInfo.measureProofJobInfo;
  }
  return {};
}

function measureProofFilenames(): string[] {
  const filenames: string[] = [];
  for (const object of measureProofSheetObjects()) {
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename' && filename.measureProofFilename) filenames.push(filename.measureProofFilename);
  }
  return filenames;
}

function measureProofManifestBounds(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  return selectionBounds(measureProofSheetObjects().filter((object) => (object as MeasureProofManifestObject).measureProofManifestKind !== 'measure-proof-manifest'));
}

function measureProofSignoffByPage(): Map<number, boolean> {
  const signoffByPage = new Map<number, boolean>();
  let pageIndex = 0;
  for (const object of measureProofSheetObjects()) {
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist') {
      pageIndex += 1;
      signoffByPage.set(pageIndex, Boolean(checklist.measureProofSignoff?.signer && checklist.measureProofSignoff?.date));
    }
  }
  return signoffByPage;
}

function measureProofStatusByPage(): Map<number, MeasureProofApprovalStatus> {
  const statusByPage = new Map<number, MeasureProofApprovalStatus>();
  for (const object of measureProofSheetObjects()) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalPage) statusByPage.set(approval.measureProofApprovalPage, approval.measureProofApprovalStatus ?? 'draft');
  }
  return statusByPage;
}

function measureProofPages(): number[] {
  const pages = new Set<number>();
  for (const object of measureProofSheetObjects()) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalPage) pages.add(approval.measureProofApprovalPage);
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename' && filename.measureProofFilenamePage) pages.add(filename.measureProofFilenamePage);
  }
  return [...pages].sort((a, b) => a - b);
}

function measureProofFilenameByPage(): Map<number, string> {
  const filenameByPage = new Map<number, string>();
  for (const object of measureProofSheetObjects()) {
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename' && filename.measureProofFilenamePage) filenameByPage.set(filename.measureProofFilenamePage, filename.measureProofFilename ?? '');
  }
  return filenameByPage;
}

function proofManifestRows(): string[] {
  const statuses = measureProofStatusCounts();
  const filenames = measureProofFilenames();
  const jobInfo = measureProofJobInfo();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  return [
    `Job: ${proofJobInfoText(jobInfo.job, 'Not set')}`,
    `Revision: ${proofJobInfoText(jobInfo.revision, 'Not set')}`,
    `Proof pages: ${pageCount}`,
    `Status: ${statuses.get('approved') ?? 0} approved · ${statuses.get('changes') ?? 0} changes · ${statuses.get('draft') ?? 0} draft`,
    `Signoff: ${signedCount}/${pageCount} complete`,
    `Files: ${filenames.length ? filenames.slice(0, 3).join(', ') : 'Not generated'}`,
  ];
}

function setProofManifestVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofManifestRows();
  for (const child of group.getObjects()) {
    const index = (child as { measureProofManifestRow?: number }).measureProofManifestRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofManifestObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Proof manifest', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#312e81',
  })];
  for (const [index, row] of proofManifestRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#312e81',
    });
    (text as { measureProofManifestRow?: number }).measureProofManifestRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX,
    top: bounds.maxY + 280,
    backgroundColor: 'rgba(238,242,255,0.95)',
  });
  const manifest = group as MeasureProofManifestObject & { name?: string };
  manifest.measureProofManifestKind = 'measure-proof-manifest';
  manifest.name = 'Measure Proof Manifest';
  manifest.excludeFromExport = false;
  return group;
}

function measureProofContact(): MeasureProofContact {
  for (const object of measureProofSheetObjects()) {
    const contact = object as MeasureProofContactObject;
    if (contact.measureProofContactKind === 'measure-proof-delivery-contact' && contact.measureProofContact) return contact.measureProofContact;
  }
  return {};
}

function proofContactRows(contact: MeasureProofContact = measureProofContact()): string[] {
  return [
    `Client: ${proofJobInfoText(contact.client, 'Not set')}`,
    `Contact: ${proofJobInfoText(contact.contact, 'Not set')}`,
    `Email: ${proofJobInfoText(contact.email, 'Not set')}`,
    `Phone: ${proofJobInfoText(contact.phone, 'Not set')}`,
  ];
}

function setProofContactVisuals(group: fabric.FabricObject, contact: MeasureProofContact = measureProofContact()): void {
  const panel = group as MeasureProofContactObject & { name?: string };
  panel.measureProofContactKind = 'measure-proof-delivery-contact';
  panel.measureProofContact = { ...contact };
  panel.name = 'Measure Proof Delivery Contact';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofContactRows(contact);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofContactRow?: number }).measureProofContactRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofContactObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Delivery contact', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#0e7490',
  })];
  for (const [index, row] of proofContactRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#0e7490',
    });
    (text as { measureProofContactRow?: number }).measureProofContactRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 410,
    backgroundColor: 'rgba(236,254,255,0.95)',
  });
  setProofContactVisuals(group, {});
  return group;
}


function measureProofSchedule(): MeasureProofSchedule {
  for (const object of measureProofSheetObjects()) {
    const schedule = object as MeasureProofScheduleObject;
    if (schedule.measureProofScheduleKind === 'measure-proof-delivery-schedule' && schedule.measureProofSchedule) return schedule.measureProofSchedule;
  }
  return {};
}

function proofScheduleRows(schedule: MeasureProofSchedule = measureProofSchedule()): string[] {
  return [
    `Due: ${proofJobInfoText(schedule.due, 'Not set')}`,
    `Ship: ${proofJobInfoText(schedule.ship, 'Not set')}`,
    `Method: ${proofJobInfoText(schedule.method, 'Not set')}`,
    `Notes: ${proofJobInfoText(schedule.notes, 'Not set')}`,
  ];
}

function setProofScheduleVisuals(group: fabric.FabricObject, schedule: MeasureProofSchedule = measureProofSchedule()): void {
  const panel = group as MeasureProofScheduleObject & { name?: string };
  panel.measureProofScheduleKind = 'measure-proof-delivery-schedule';
  panel.measureProofSchedule = { ...schedule };
  panel.name = 'Measure Proof Delivery Schedule';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofScheduleRows(schedule);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofScheduleRow?: number }).measureProofScheduleRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofScheduleObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Delivery schedule', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#1d4ed8',
  })];
  for (const [index, row] of proofScheduleRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#1d4ed8',
    });
    (text as { measureProofScheduleRow?: number }).measureProofScheduleRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 500,
    backgroundColor: 'rgba(239,246,255,0.95)',
  });
  setProofScheduleVisuals(group, {});
  return group;
}


function measureProofRoute(): MeasureProofRoute {
  for (const object of measureProofSheetObjects()) {
    const route = object as MeasureProofRouteObject;
    if (route.measureProofRouteKind === 'measure-proof-delivery-route' && route.measureProofRoute) return route.measureProofRoute;
  }
  return {};
}

function proofRouteRows(route: MeasureProofRoute = measureProofRoute()): string[] {
  return [
    `Carrier: ${proofJobInfoText(route.carrier, 'Not set')}`,
    `Service: ${proofJobInfoText(route.service, 'Not set')}`,
    `Account: ${proofJobInfoText(route.account, 'Not set')}`,
    `Address: ${proofJobInfoText(route.address, 'Not set')}`,
  ];
}

function setProofRouteVisuals(group: fabric.FabricObject, route: MeasureProofRoute = measureProofRoute()): void {
  const panel = group as MeasureProofRouteObject & { name?: string };
  panel.measureProofRouteKind = 'measure-proof-delivery-route';
  panel.measureProofRoute = { ...route };
  panel.name = 'Measure Proof Delivery Route';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofRouteRows(route);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofRouteRow?: number }).measureProofRouteRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofRouteObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Delivery route', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#4338ca',
  })];
  for (const [index, row] of proofRouteRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#4338ca',
    });
    (text as { measureProofRouteRow?: number }).measureProofRouteRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 590,
    backgroundColor: 'rgba(238,242,255,0.95)',
  });
  setProofRouteVisuals(group, {});
  return group;
}


function measureProofFulfillment(): MeasureProofFulfillment {
  for (const object of measureProofSheetObjects()) {
    const fulfillment = object as MeasureProofFulfillmentObject;
    if (fulfillment.measureProofFulfillmentKind === 'measure-proof-fulfillment-handoff' && fulfillment.measureProofFulfillment) return fulfillment.measureProofFulfillment;
  }
  return {};
}

function proofFulfillmentRows(fulfillment: MeasureProofFulfillment = measureProofFulfillment()): string[] {
  return [
    `Quantity: ${proofJobInfoText(fulfillment.quantity, 'Not set')}`,
    `Packaging: ${proofJobInfoText(fulfillment.packaging, 'Not set')}`,
    `Owner: ${proofJobInfoText(fulfillment.owner, 'Not set')}`,
    `Tracking: ${proofJobInfoText(fulfillment.tracking, 'Not set')}`,
  ];
}

function setProofFulfillmentVisuals(group: fabric.FabricObject, fulfillment: MeasureProofFulfillment = measureProofFulfillment()): void {
  const panel = group as MeasureProofFulfillmentObject & { name?: string };
  panel.measureProofFulfillmentKind = 'measure-proof-fulfillment-handoff';
  panel.measureProofFulfillment = { ...fulfillment };
  panel.name = 'Measure Proof Fulfillment Handoff';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofFulfillmentRows(fulfillment);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofFulfillmentRow?: number }).measureProofFulfillmentRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofFulfillmentObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Fulfillment handoff', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#6d28d9',
  })];
  for (const [index, row] of proofFulfillmentRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#6d28d9',
    });
    (text as { measureProofFulfillmentRow?: number }).measureProofFulfillmentRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 680,
    backgroundColor: 'rgba(245,243,255,0.95)',
  });
  setProofFulfillmentVisuals(group, {});
  return group;
}


function measureProofInstall(): MeasureProofInstall {
  for (const object of measureProofSheetObjects()) {
    const install = object as MeasureProofInstallObject;
    if (install.measureProofInstallKind === 'measure-proof-install-handoff' && install.measureProofInstall) return install.measureProofInstall;
  }
  return {};
}

function proofInstallRows(install: MeasureProofInstall = measureProofInstall()): string[] {
  return [
    `Installer: ${proofJobInfoText(install.installer, 'Not set')}`,
    `Date: ${proofJobInfoText(install.date, 'Not set')}`,
    `Site: ${proofJobInfoText(install.site, 'Not set')}`,
    `Notes: ${proofJobInfoText(install.notes, 'Not set')}`,
  ];
}

function setProofInstallVisuals(group: fabric.FabricObject, install: MeasureProofInstall = measureProofInstall()): void {
  const panel = group as MeasureProofInstallObject & { name?: string };
  panel.measureProofInstallKind = 'measure-proof-install-handoff';
  panel.measureProofInstall = { ...install };
  panel.name = 'Measure Proof Install Handoff';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofInstallRows(install);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofInstallRow?: number }).measureProofInstallRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofInstallObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Install handoff', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#7e22ce',
  })];
  for (const [index, row] of proofInstallRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#7e22ce',
    });
    (text as { measureProofInstallRow?: number }).measureProofInstallRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 770,
    backgroundColor: 'rgba(250,245,255,0.95)',
  });
  setProofInstallVisuals(group, {});
  return group;
}


function measureProofSiteReadiness(): MeasureProofSiteReadiness {
  for (const object of measureProofSheetObjects()) {
    const readiness = object as MeasureProofSiteReadinessObject;
    if (readiness.measureProofSiteReadinessKind === 'measure-proof-site-readiness' && readiness.measureProofSiteReadiness) return readiness.measureProofSiteReadiness;
  }
  return {};
}

function proofSiteReadinessRows(readiness: MeasureProofSiteReadiness = measureProofSiteReadiness()): string[] {
  return [
    `Permit: ${proofJobInfoText(readiness.permit, 'Not set')}`,
    `Access: ${proofJobInfoText(readiness.access, 'Not set')}`,
    `Power: ${proofJobInfoText(readiness.power, 'Not set')}`,
    `Risks: ${proofJobInfoText(readiness.risks, 'Not set')}`,
  ];
}

function setProofSiteReadinessVisuals(group: fabric.FabricObject, readiness: MeasureProofSiteReadiness = measureProofSiteReadiness()): void {
  const panel = group as MeasureProofSiteReadinessObject & { name?: string };
  panel.measureProofSiteReadinessKind = 'measure-proof-site-readiness';
  panel.measureProofSiteReadiness = { ...readiness };
  panel.name = 'Measure Proof Site Readiness';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofSiteReadinessRows(readiness);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofSiteReadinessRow?: number }).measureProofSiteReadinessRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofSiteReadinessObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Site readiness', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#9333ea',
  })];
  for (const [index, row] of proofSiteReadinessRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#9333ea',
    });
    (text as { measureProofSiteReadinessRow?: number }).measureProofSiteReadinessRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 860,
    backgroundColor: 'rgba(253,244,255,0.95)',
  });
  setProofSiteReadinessVisuals(group, {});
  return group;
}


function measureProofPunchList(): MeasureProofPunchList {
  for (const object of measureProofSheetObjects()) {
    const punchList = object as MeasureProofPunchListObject;
    if (punchList.measureProofPunchListKind === 'measure-proof-install-punch-list' && punchList.measureProofPunchList) return punchList.measureProofPunchList;
  }
  return {};
}

function proofPunchListRows(punchList: MeasureProofPunchList = measureProofPunchList()): string[] {
  return [
    `Open items: ${proofJobInfoText(punchList.open, 'Not set')}`,
    `Owner: ${proofJobInfoText(punchList.owner, 'Not set')}`,
    `Due: ${proofJobInfoText(punchList.due, 'Not set')}`,
    `Resolution: ${proofJobInfoText(punchList.resolution, 'Not set')}`,
  ];
}

function setProofPunchListVisuals(group: fabric.FabricObject, punchList: MeasureProofPunchList = measureProofPunchList()): void {
  const panel = group as MeasureProofPunchListObject & { name?: string };
  panel.measureProofPunchListKind = 'measure-proof-install-punch-list';
  panel.measureProofPunchList = { ...punchList };
  panel.name = 'Measure Proof Install Punch List';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofPunchListRows(punchList);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofPunchListRow?: number }).measureProofPunchListRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofPunchListObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Install punch list', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#a21caf',
  })];
  for (const [index, row] of proofPunchListRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#a21caf',
    });
    (text as { measureProofPunchListRow?: number }).measureProofPunchListRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 950,
    backgroundColor: 'rgba(252,231,243,0.95)',
  });
  setProofPunchListVisuals(group, {});
  return group;
}


function measureProofAcceptance(): MeasureProofAcceptance {
  for (const object of measureProofSheetObjects()) {
    const acceptance = object as MeasureProofAcceptanceObject;
    if (acceptance.measureProofAcceptanceKind === 'measure-proof-client-acceptance' && acceptance.measureProofAcceptance) return acceptance.measureProofAcceptance;
  }
  return {};
}

function proofAcceptanceRows(acceptance: MeasureProofAcceptance = measureProofAcceptance()): string[] {
  return [
    `Accepted by: ${proofJobInfoText(acceptance.acceptedBy, 'Not set')}`,
    `Date: ${proofJobInfoText(acceptance.date, 'Not set')}`,
    `Status: ${proofJobInfoText(acceptance.status, 'Pending')}`,
    `Notes: ${proofJobInfoText(acceptance.notes, 'Not set')}`,
  ];
}

function setProofAcceptanceVisuals(group: fabric.FabricObject, acceptance: MeasureProofAcceptance = measureProofAcceptance()): void {
  const panel = group as MeasureProofAcceptanceObject & { name?: string };
  panel.measureProofAcceptanceKind = 'measure-proof-client-acceptance';
  panel.measureProofAcceptance = { ...acceptance };
  panel.name = 'Measure Proof Client Acceptance';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofAcceptanceRows(acceptance);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofAcceptanceRow?: number }).measureProofAcceptanceRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofAcceptanceObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Client acceptance', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#be185d',
  })];
  for (const [index, row] of proofAcceptanceRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#be185d',
    });
    (text as { measureProofAcceptanceRow?: number }).measureProofAcceptanceRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 1040,
    backgroundColor: 'rgba(253,242,248,0.95)',
  });
  setProofAcceptanceVisuals(group, {});
  return group;
}


function measureProofWarranty(): MeasureProofWarranty {
  for (const object of measureProofSheetObjects()) {
    const warranty = object as MeasureProofWarrantyObject;
    if (warranty.measureProofWarrantyKind === 'measure-proof-warranty-info' && warranty.measureProofWarranty) return warranty.measureProofWarranty;
  }
  return {};
}

function proofWarrantyRows(warranty: MeasureProofWarranty = measureProofWarranty()): string[] {
  return [
    `Term: ${proofJobInfoText(warranty.term, 'Not set')}`,
    `Coverage: ${proofJobInfoText(warranty.coverage, 'Not set')}`,
    `Contact: ${proofJobInfoText(warranty.contact, 'Not set')}`,
    `Notes: ${proofJobInfoText(warranty.notes, 'Not set')}`,
  ];
}

function setProofWarrantyVisuals(group: fabric.FabricObject, warranty: MeasureProofWarranty = measureProofWarranty()): void {
  const panel = group as MeasureProofWarrantyObject & { name?: string };
  panel.measureProofWarrantyKind = 'measure-proof-warranty-info';
  panel.measureProofWarranty = { ...warranty };
  panel.name = 'Measure Proof Warranty Info';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofWarrantyRows(warranty);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofWarrantyRow?: number }).measureProofWarrantyRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofWarrantyObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Warranty info', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#9d174d',
  })];
  for (const [index, row] of proofWarrantyRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#9d174d',
    });
    (text as { measureProofWarrantyRow?: number }).measureProofWarrantyRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 1130,
    backgroundColor: 'rgba(255,241,242,0.95)',
  });
  setProofWarrantyVisuals(group, {});
  return group;
}


function measureProofCare(): MeasureProofCare {
  for (const object of measureProofSheetObjects()) {
    const care = object as MeasureProofCareObject;
    if (care.measureProofCareKind === 'measure-proof-care-instructions' && care.measureProofCare) return care.measureProofCare;
  }
  return {};
}

function proofCareRows(care: MeasureProofCare = measureProofCare()): string[] {
  return [
    `Cleaning: ${proofJobInfoText(care.cleaning, 'Not set')}`,
    `Chemicals: ${proofJobInfoText(care.chemicals, 'Not set')}`,
    `Inspection: ${proofJobInfoText(care.inspection, 'Not set')}`,
    `Notes: ${proofJobInfoText(care.notes, 'Not set')}`,
  ];
}

function setProofCareVisuals(group: fabric.FabricObject, care: MeasureProofCare = measureProofCare()): void {
  const panel = group as MeasureProofCareObject & { name?: string };
  panel.measureProofCareKind = 'measure-proof-care-instructions';
  panel.measureProofCare = { ...care };
  panel.name = 'Measure Proof Care Instructions';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofCareRows(care);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofCareRow?: number }).measureProofCareRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofCareObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Care instructions', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#831843',
  })];
  for (const [index, row] of proofCareRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#831843',
    });
    (text as { measureProofCareRow?: number }).measureProofCareRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 1220,
    backgroundColor: 'rgba(255,247,237,0.95)',
  });
  setProofCareVisuals(group, {});
  return group;
}


function measureProofArchive(): MeasureProofArchive {
  for (const object of measureProofSheetObjects()) {
    const archive = object as MeasureProofArchiveObject;
    if (archive.measureProofArchiveKind === 'measure-proof-asset-archive' && archive.measureProofArchive) return archive.measureProofArchive;
  }
  return {};
}

function proofArchiveRows(archive: MeasureProofArchive = measureProofArchive()): string[] {
  return [
    `Source: ${proofJobInfoText(archive.source, 'Not set')}`,
    `Exports: ${proofJobInfoText(archive.exports, 'Not set')}`,
    `Photos: ${proofJobInfoText(archive.photos, 'Not set')}`,
    `Notes: ${proofJobInfoText(archive.notes, 'Not set')}`,
  ];
}

function setProofArchiveVisuals(group: fabric.FabricObject, archive: MeasureProofArchive = measureProofArchive()): void {
  const panel = group as MeasureProofArchiveObject & { name?: string };
  panel.measureProofArchiveKind = 'measure-proof-asset-archive';
  panel.measureProofArchive = { ...archive };
  panel.name = 'Measure Proof Asset Archive';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofArchiveRows(archive);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofArchiveRow?: number }).measureProofArchiveRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofArchiveObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Asset archive', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#92400e',
  })];
  for (const [index, row] of proofArchiveRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#92400e',
    });
    (text as { measureProofArchiveRow?: number }).measureProofArchiveRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 1310,
    backgroundColor: 'rgba(254,243,199,0.95)',
  });
  setProofArchiveVisuals(group, {});
  return group;
}


function measureProofVerification(): MeasureProofVerification {
  for (const object of measureProofSheetObjects()) {
    const verification = object as MeasureProofVerificationObject;
    if (verification.measureProofVerificationKind === 'measure-proof-file-verification' && verification.measureProofVerification) return verification.measureProofVerification;
  }
  return {};
}

function proofVerificationRows(verification: MeasureProofVerification = measureProofVerification()): string[] {
  return [
    `Version: ${proofJobInfoText(verification.version, 'Not set')}`,
    `Checksum: ${proofJobInfoText(verification.checksum, 'Not set')}`,
    `Reviewed: ${proofJobInfoText(verification.reviewed, 'Not set')}`,
    `Notes: ${proofJobInfoText(verification.notes, 'Not set')}`,
  ];
}

function setProofVerificationVisuals(group: fabric.FabricObject, verification: MeasureProofVerification = measureProofVerification()): void {
  const panel = group as MeasureProofVerificationObject & { name?: string };
  panel.measureProofVerificationKind = 'measure-proof-file-verification';
  panel.measureProofVerification = { ...verification };
  panel.name = 'Measure Proof File Verification';
  panel.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  const rows = proofVerificationRows(verification);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofVerificationRow?: number }).measureProofVerificationRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofVerificationObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('File verification', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#065f46',
  })];
  for (const [index, row] of proofVerificationRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#065f46',
    });
    (text as { measureProofVerificationRow?: number }).measureProofVerificationRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 580,
    top: bounds.maxY + 1400,
    backgroundColor: 'rgba(209,250,229,0.95)',
  });
  setProofVerificationVisuals(group, {});
  return group;
}


function proofRevisionRows(): string[] {
  const jobInfo = measureProofJobInfo();
  const statuses = measureProofStatusCounts();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  const revision = proofJobInfoText(jobInfo.revision, 'Rev draft');
  const prepared = proofJobInfoText(jobInfo.prepared, 'Unassigned');
  const notes = proofJobInfoText(jobInfo.notes, 'No notes');
  return [
    `Revision: ${revision}`,
    `Prepared: ${prepared}`,
    `Pages tracked: ${pageCount}`,
    `Approvals: ${statuses.get('approved') ?? 0}/${pageCount} approved`,
    `Changes: ${statuses.get('changes') ?? 0} flagged`,
    `Signoff: ${signedCount}/${pageCount} complete`,
    `Notes: ${notes}`,
  ];
}

function setProofRevisionVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofRevisionRows();
  for (const child of group.getObjects()) {
    const index = (child as { measureProofRevisionRow?: number }).measureProofRevisionRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofRevisionObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Revision history', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#7c2d12',
  })];
  for (const [index, row] of proofRevisionRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#7c2d12',
    });
    (text as { measureProofRevisionRow?: number }).measureProofRevisionRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + Math.max(0, bounds.width - 260),
    top: bounds.maxY + 280,
    backgroundColor: 'rgba(255,247,237,0.95)',
  });
  const revision = group as MeasureProofRevisionObject & { name?: string };
  revision.measureProofRevisionKind = 'measure-proof-revision-history';
  revision.name = 'Measure Proof Revision History';
  revision.excludeFromExport = false;
  return group;
}

function proofAuditRows(): string[] {
  const statuses = measureProofStatusCounts();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  const unsignedCount = measureProofUnsignedCount();
  const approvedCount = statuses.get('approved') ?? 0;
  const changesCount = statuses.get('changes') ?? 0;
  const draftCount = statuses.get('draft') ?? 0;
  const blockerCount = changesCount + draftCount + unsignedCount;
  const readiness = pageCount > 0 && blockerCount === 0 ? 'Ready for production' : `${blockerCount} blockers before production`;
  return [
    `Readiness: ${readiness}`,
    `Approved pages: ${approvedCount}/${pageCount}`,
    `Changes required: ${changesCount}`,
    `Draft pages: ${draftCount}`,
    `Unsigned pages: ${unsignedCount}`,
    `Signed pages: ${signedCount}/${pageCount}`,
    `Next step: ${blockerCount === 0 ? 'Export approved package' : 'Resolve changes/drafts/signoff'}`,
  ];
}

function setProofAuditVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofAuditRows();
  for (const child of group.getObjects()) {
    const index = (child as { measureProofAuditRow?: number }).measureProofAuditRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofAuditObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Approval audit', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#14532d',
  })];
  for (const [index, row] of proofAuditRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#14532d',
    });
    (text as { measureProofAuditRow?: number }).measureProofAuditRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX,
    top: bounds.maxY + 410,
    backgroundColor: 'rgba(240,253,244,0.95)',
  });
  const audit = group as MeasureProofAuditObject & { name?: string };
  audit.measureProofAuditKind = 'measure-proof-approval-audit';
  audit.name = 'Measure Proof Approval Audit';
  audit.excludeFromExport = false;
  return group;
}

function proofIndexRows(): string[] {
  const pages = measureProofPages();
  const statusByPage = measureProofStatusByPage();
  const filenameByPage = measureProofFilenameByPage();
  const signoffByOrdinal = measureProofSignoffByPage();
  const rows = [`Pages indexed: ${pages.length}`];
  for (const [ordinal, page] of pages.entries()) {
    const status = statusByPage.get(page) ?? 'draft';
    const filename = filenameByPage.get(page) || `proof-p${String(page).padStart(2, '0')}.pdf`;
    rows.push(`P${String(page).padStart(2, '0')} · ${status} · ${signoffByOrdinal.get(ordinal + 1) ? 'signed' : 'unsigned'} · ${filename}`);
  }
  return rows;
}

function setProofIndexVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofIndexRows();
  const existing = group.getObjects();
  const template = existing.find((child) => typeof (child as { measureProofIndexRow?: number }).measureProofIndexRow === 'number') as fabric.FabricText | undefined;
  for (let index = existing.length - 1; index < rows.length; index += 1) {
    const text = new fabric.FabricText('', {
      left: template?.left ?? 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#581c87',
    });
    (text as { measureProofIndexRow?: number }).measureProofIndexRow = index;
    group.add(text);
  }
  for (const child of group.getObjects()) {
    const index = (child as { measureProofIndexRow?: number }).measureProofIndexRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofIndexObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Package index', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#581c87',
  })];
  for (const [index, row] of proofIndexRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#581c87',
    });
    (text as { measureProofIndexRow?: number }).measureProofIndexRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + 290,
    top: bounds.maxY + 410,
    backgroundColor: 'rgba(250,245,255,0.95)',
  });
  const index = group as MeasureProofIndexObject & { name?: string };
  index.measureProofIndexKind = 'measure-proof-package-index';
  index.name = 'Measure Proof Package Index';
  index.excludeFromExport = false;
  return group;
}

function proofCoverRows(): string[] {
  const jobInfo = measureProofJobInfo();
  const statuses = measureProofStatusCounts();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  const unsignedCount = measureProofUnsignedCount();
  const filenames = measureProofFilenames();
  const approvedCount = statuses.get('approved') ?? 0;
  const changesCount = statuses.get('changes') ?? 0;
  const draftCount = statuses.get('draft') ?? 0;
  const ready = pageCount > 0 && approvedCount === pageCount && signedCount === pageCount && changesCount === 0 && draftCount === 0;
  return [
    `Job: ${proofJobInfoText(jobInfo.job, 'Not set')}`,
    `Revision: ${proofJobInfoText(jobInfo.revision, 'Not set')}`,
    `Prepared by: ${proofJobInfoText(jobInfo.prepared, 'Unassigned')}`,
    `Package pages: ${pageCount}`,
    `Approval: ${approvedCount} approved · ${changesCount} changes · ${draftCount} draft`,
    `Signoff: ${signedCount}/${pageCount} complete · ${unsignedCount} unsigned`,
    `Output: ${filenames.length ? filenames.slice(0, 2).join(', ') : 'No filenames yet'}`,
    `Package status: ${ready ? 'Ready to release' : 'Hold for review'}`,
  ];
}

function setProofCoverVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofCoverRows();
  for (const child of group.getObjects()) {
    const index = (child as { measureProofCoverRow?: number }).measureProofCoverRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofCoverObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Proof package cover', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 15,
    fontWeight: 'bold',
    fill: '#0f172a',
  })];
  for (const [index, row] of proofCoverRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 26 + index * 17,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#0f172a',
    });
    (text as { measureProofCoverRow?: number }).measureProofCoverRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX,
    top: bounds.minY - 250,
    backgroundColor: 'rgba(248,250,252,0.96)',
  });
  const cover = group as MeasureProofCoverObject & { name?: string };
  cover.measureProofCoverKind = 'measure-proof-package-cover';
  cover.name = 'Measure Proof Package Cover';
  cover.excludeFromExport = false;
  return group;
}

function measureProofReleaseReady(): boolean {
  const jobInfo = measureProofJobInfo();
  const statuses = measureProofStatusCounts();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  const filenames = measureProofFilenames();
  return pageCount > 0
    && Boolean(jobInfo.job && jobInfo.revision && jobInfo.prepared)
    && filenames.length >= pageCount
    && (statuses.get('approved') ?? 0) === pageCount
    && (statuses.get('changes') ?? 0) === 0
    && (statuses.get('draft') ?? 0) === 0
    && signedCount === pageCount;
}

function proofDeliveryRows(): string[] {
  const jobInfo = measureProofJobInfo();
  const statuses = measureProofStatusCounts();
  const pageCount = measureProofPageCount();
  const signedCount = measureProofSignoffCount();
  const filenames = measureProofFilenames();
  const approvedCount = statuses.get('approved') ?? 0;
  const changesCount = statuses.get('changes') ?? 0;
  const draftCount = statuses.get('draft') ?? 0;
  return [
    `${jobInfo.job ? '✓' : '•'} Job name: ${proofJobInfoText(jobInfo.job, 'missing')}`,
    `${jobInfo.revision ? '✓' : '•'} Revision: ${proofJobInfoText(jobInfo.revision, 'missing')}`,
    `${jobInfo.prepared ? '✓' : '•'} Prepared by: ${proofJobInfoText(jobInfo.prepared, 'missing')}`,
    `${pageCount > 0 ? '✓' : '!'} Proof pages: ${pageCount}`,
    `${filenames.length >= pageCount && pageCount > 0 ? '✓' : '•'} Export filenames: ${filenames.length}/${pageCount}`,
    `${approvedCount === pageCount && pageCount > 0 ? '✓' : '!'} Approved pages: ${approvedCount}/${pageCount}`,
    `${changesCount === 0 ? '✓' : '!'} Changes required: ${changesCount}`,
    `${draftCount === 0 ? '✓' : '!'} Draft pages: ${draftCount}`,
    `${signedCount === pageCount && pageCount > 0 ? '✓' : '!'} Signoff complete: ${signedCount}/${pageCount}`,
  ];
}

function setProofDeliveryVisuals(group: fabric.FabricObject): void {
  if (!(group instanceof fabric.Group)) return;
  const rows = proofDeliveryRows();
  for (const child of group.getObjects()) {
    const index = (child as { measureProofDeliveryRow?: number }).measureProofDeliveryRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) {
      const row = rows[index] ?? '';
      child.set({ text: row, fill: row.startsWith('✓') ? '#166534' : row.startsWith('!') ? '#991b1b' : '#854d0e' });
    }
  }
}

function proofDeliveryObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Delivery checklist', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 'bold',
    fill: '#1e3a8a',
  })];
  for (const [index, row] of proofDeliveryRows().entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 22 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: row.startsWith('✓') ? '#166534' : row.startsWith('!') ? '#991b1b' : '#854d0e',
    });
    (text as { measureProofDeliveryRow?: number }).measureProofDeliveryRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.minX + Math.max(0, bounds.width - 280),
    top: bounds.maxY + 410,
    backgroundColor: 'rgba(239,246,255,0.95)',
  });
  const delivery = group as MeasureProofDeliveryObject & { name?: string };
  delivery.measureProofDeliveryKind = 'measure-proof-delivery-checklist';
  delivery.name = 'Measure Proof Delivery Checklist';
  delivery.excludeFromExport = false;
  return group;
}

function setProofReleaseVisuals(group: fabric.FabricObject): void {
  const ready = measureProofReleaseReady();
  const release = group as MeasureProofReleaseObject & { name?: string };
  release.measureProofReleaseKind = 'measure-proof-release-stamp';
  release.name = `Measure Proof ${ready ? 'Release Ready' : 'Release Hold'} Stamp`;
  release.excludeFromExport = false;
  if (!(group instanceof fabric.Group)) return;
  for (const child of group.getObjects()) {
    const role = (child as { measureProofReleaseRole?: string }).measureProofReleaseRole;
    if (role === 'box') child.set({ fill: ready ? 'rgba(220,252,231,0.96)' : 'rgba(254,249,195,0.96)', stroke: ready ? '#16a34a' : '#ca8a04' });
    else if (role === 'label' && child instanceof fabric.FabricText) child.set({ text: ready ? 'RELEASE READY' : 'RELEASE HOLD', fill: ready ? '#166534' : '#854d0e' });
    else if (role === 'detail' && child instanceof fabric.FabricText) child.set({ text: ready ? 'Approved package can ship' : 'Resolve delivery checklist', fill: ready ? '#166534' : '#854d0e' });
  }
}

function proofReleaseObject(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): fabric.Group {
  const box = new fabric.Rect({ left: 0, top: 0, width: 170, height: 56, rx: 8, ry: 8, fill: 'rgba(254,249,195,0.96)', stroke: '#ca8a04', strokeWidth: 1.5 });
  (box as { measureProofReleaseRole?: string }).measureProofReleaseRole = 'box';
  const label = new fabric.FabricText('RELEASE HOLD', {
    left: 85,
    top: 11,
    originX: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#854d0e',
  });
  (label as { measureProofReleaseRole?: string }).measureProofReleaseRole = 'label';
  const detail = new fabric.FabricText('Resolve delivery checklist', {
    left: 85,
    top: 34,
    originX: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 9,
    fill: '#854d0e',
  });
  (detail as { measureProofReleaseRole?: string }).measureProofReleaseRole = 'detail';
  const group = new fabric.Group([box, label, detail], {
    left: bounds.minX + Math.max(0, bounds.width - 180),
    top: bounds.minY - 250,
    backgroundColor: 'rgba(255,255,255,0)',
  });
  setProofReleaseVisuals(group);
  return group;
}

function proofPreflightRows(artworkBounds: { width: number; height: number }, marginMm: number, bleedMm: number, filename = '', status: MeasureProofApprovalStatus = 'draft'): string[] {
  const artworkWidthMm = artworkBounds.width / MM_TO_PX;
  const artworkHeightMm = artworkBounds.height / MM_TO_PX;
  const statusLabel = status === 'approved' ? 'approved' : status === 'changes' ? 'changes required' : 'draft review';
  return [
    `✓ Size ${artworkWidthMm.toFixed(1)} × ${artworkHeightMm.toFixed(1)} mm`,
    `✓ Bleed ${bleedMm.toFixed(1)} mm + trim marks`,
    `✓ Safe margin ${marginMm.toFixed(1)} mm noted`,
    `${status === 'approved' ? '✓' : status === 'changes' ? '!' : '•'} Approval status: ${statusLabel}`,
    `${filename ? '✓' : '•'} Export filename: ${filename || 'pending job metadata'}`,
  ];
}

function setProofPreflightVisuals(group: fabric.FabricObject, filename = '', status: MeasureProofApprovalStatus = 'draft'): void {
  const preflight = group as MeasureProofPreflightObject & { measureProofPreflightArtwork?: { width: number; height: number }; measureProofPreflightMarginMm?: number; measureProofPreflightBleedMm?: number };
  preflight.measureProofPreflightStatus = status;
  preflight.measureProofPreflightFilename = filename;
  if (!(group instanceof fabric.Group) || !preflight.measureProofPreflightArtwork) return;
  const rows = proofPreflightRows(preflight.measureProofPreflightArtwork, preflight.measureProofPreflightMarginMm ?? 0, preflight.measureProofPreflightBleedMm ?? 0, filename, status);
  for (const child of group.getObjects()) {
    const index = (child as { measureProofPreflightRow?: number }).measureProofPreflightRow;
    if (typeof index === 'number' && child instanceof fabric.FabricText) child.set({ text: rows[index] ?? '' });
  }
}

function proofPagePreflightObject(proofBounds: { left: number; top: number; width: number; height: number }, artworkBounds: NonNullable<ReturnType<typeof selectionBounds>> | { width: number; height: number }, marginMm: number, bleedMm: number, pageIndex: number): fabric.Group {
  const rows = proofPreflightRows(artworkBounds, marginMm, bleedMm, proofFilename(pageIndex), 'draft');
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Preflight summary', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 'bold',
    fill: '#065f46',
  })];
  for (const [index, row] of rows.entries()) {
    const text = new fabric.FabricText(row, {
      left: 0,
      top: 20 + index * 15,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#064e3b',
    });
    (text as { measureProofPreflightRow?: number }).measureProofPreflightRow = index;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: proofBounds.left + Math.max(0, proofBounds.width - 230),
    top: proofBounds.top + proofBounds.height + 210,
    backgroundColor: 'rgba(236,253,245,0.95)',
  });
  const preflight = group as MeasureProofPreflightObject & { name?: string; measureProofPreflightArtwork?: { width: number; height: number }; measureProofPreflightMarginMm?: number; measureProofPreflightBleedMm?: number };
  preflight.measureProofPreflightKind = 'measure-proof-preflight';
  preflight.measureProofPreflightPage = pageIndex;
  preflight.measureProofPreflightArtwork = { width: artworkBounds.width, height: artworkBounds.height };
  preflight.measureProofPreflightMarginMm = marginMm;
  preflight.measureProofPreflightBleedMm = bleedMm;
  preflight.measureProofPreflightFilename = proofFilename(pageIndex);
  preflight.measureProofPreflightStatus = 'draft';
  preflight.name = 'Measure Proof Preflight Summary';
  preflight.excludeFromExport = false;
  return group;
}

function proofPageSafetyObject(proofBounds: { left: number; top: number; width: number; height: number }, marginMm: number): fabric.Group {
  const rows = [
    `Keep critical content inside artwork frame.`,
    `Verify cut contour/finish marks before output.`,
    `Safe margin: ${marginMm.toFixed(1)} mm from trim frame.`,
  ];
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Safety / cut notes', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 'bold',
    fill: '#b45309',
  })];
  for (const [index, row] of rows.entries()) {
    objects.push(new fabric.FabricText(`• ${row}`, {
      left: 0,
      top: 20 + index * 15,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#0f172a',
    }));
  }
  const group = new fabric.Group(objects, {
    left: proofBounds.left + Math.max(0, proofBounds.width - 230),
    top: proofBounds.top + proofBounds.height + 150,
    backgroundColor: 'rgba(255,251,235,0.95)',
  });
  const safety = group as MeasureProofSafetyObject & { name?: string };
  safety.measureProofSafetyKind = 'measure-proof-safety';
  safety.name = 'Measure Proof Safety Notes';
  safety.excludeFromExport = false;
  return group;
}

function proofPageSpecsObject(proofBounds: { left: number; top: number; width: number; height: number }, artworkBounds: NonNullable<ReturnType<typeof selectionBounds>> | { width: number; height: number }, marginMm: number, bleedMm: number): fabric.Group {
  const rows = [
    `Artwork: ${(artworkBounds.width / MM_TO_PX).toFixed(1)} × ${(artworkBounds.height / MM_TO_PX).toFixed(1)} mm`,
    `Trim: ${(proofBounds.width / MM_TO_PX).toFixed(1)} × ${(proofBounds.height / MM_TO_PX).toFixed(1)} mm`,
    `Margin: ${marginMm.toFixed(1)} mm`,
    `Bleed: ${bleedMm.toFixed(1)} mm`,
  ];
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Production specs', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 'bold',
    fill: '#0f172a',
  })];
  for (const [index, row] of rows.entries()) {
    objects.push(new fabric.FabricText(row, {
      left: 0,
      top: 20 + index * 15,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#0f172a',
    }));
  }
  const group = new fabric.Group(objects, {
    left: proofBounds.left,
    top: proofBounds.top - 88,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const specs = group as MeasureProofSpecsObject & { name?: string };
  specs.measureProofSpecsKind = 'measure-proof-specs';
  specs.name = 'Measure Proof Production Specs';
  specs.excludeFromExport = false;
  return group;
}

function proofFilenamePart(value: string | undefined, fallback: string): string {
  const part = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return part || fallback;
}

function proofFilename(pageIndex: number, info: MeasureProofJobInfo = {}, status: MeasureProofApprovalStatus = 'draft'): string {
  const job = proofFilenamePart(info.job, 'measure-proof');
  const revision = proofFilenamePart(info.revision, 'rev');
  return `${job}-${revision}-${status}-p${String(pageIndex).padStart(2, '0')}.pdf`;
}

function setProofFilenameVisuals(object: fabric.FabricObject, info: MeasureProofJobInfo = {}, status: MeasureProofApprovalStatus = 'draft'): void {
  const filenameObject = object as MeasureProofFilenameObject & { name?: string };
  const pageIndex = filenameObject.measureProofFilenamePage ?? 1;
  const filename = proofFilename(pageIndex, info, status);
  filenameObject.measureProofFilenameKind = 'measure-proof-filename';
  filenameObject.measureProofFilename = filename;
  filenameObject.name = `Measure Proof Filename ${pageIndex}`;
  filenameObject.excludeFromExport = false;
  if (object instanceof fabric.FabricText) object.set({ text: `Export file: ${filename}` });
}

function proofPageFilenameObject(bounds: { left: number; top: number; width: number; height: number }, pageIndex: number): fabric.FabricText {
  const label = new fabric.FabricText('', {
    left: bounds.left,
    top: bounds.top + bounds.height + 210,
    originX: 'left',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 10,
    fill: '#334155',
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  (label as MeasureProofFilenameObject).measureProofFilenamePage = pageIndex;
  setProofFilenameVisuals(label);
  return label;
}

function proofJobInfoText(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  return text ? text.slice(0, 80) : fallback;
}

function proofJobInfoRows(pageIndex: number, info: MeasureProofJobInfo = {}): Array<{ role: string; text: string }> {
  return [
    { role: 'job', text: `Job: ${proofJobInfoText(info.job, '____________________')}` },
    { role: 'revision', text: `Revision: ${proofJobInfoText(info.revision, '______')}  Page: ${pageIndex}` },
    { role: 'prepared', text: `Prepared: ${proofJobInfoText(info.prepared, '_______________')}` },
    { role: 'notes', text: `Notes: ${proofJobInfoText(info.notes, '__________________')}` },
  ];
}

function setProofJobInfoVisuals(group: fabric.FabricObject, info: MeasureProofJobInfo): void {
  const proofInfo = group as MeasureProofJobInfoObject;
  const pageIndex = proofInfo.measureProofJobInfoPage ?? 1;
  proofInfo.measureProofJobInfo = {
    job: info.job?.trim() ?? '',
    revision: info.revision?.trim() ?? '',
    prepared: info.prepared?.trim() ?? '',
    notes: info.notes?.trim() ?? '',
  };
  if (!(group instanceof fabric.Group)) return;
  const rows = new Map(proofJobInfoRows(pageIndex, proofInfo.measureProofJobInfo).map((row) => [row.role, row.text]));
  for (const child of group.getObjects()) {
    const role = (child as { measureProofJobInfoRole?: string }).measureProofJobInfoRole;
    if (role && child instanceof fabric.FabricText) child.set({ text: rows.get(role) ?? child.text });
  }
}

function proofPageJobInfoObject(bounds: { left: number; top: number; width: number; height: number }, pageIndex: number, jobInfo: MeasureProofJobInfo = {}): fabric.Group {
  const rows = proofJobInfoRows(pageIndex, jobInfo);
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Job information', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 'bold',
    fill: '#0f172a',
  })];
  for (const [index, row] of rows.entries()) {
    const text = new fabric.FabricText(row.text, {
      left: 0,
      top: 20 + index * 16,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: '#0f172a',
    });
    (text as { measureProofJobInfoRole?: string }).measureProofJobInfoRole = row.role;
    objects.push(text);
  }
  const group = new fabric.Group(objects, {
    left: bounds.left + Math.max(0, bounds.width - 165),
    top: bounds.top - 88,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const info = group as MeasureProofJobInfoObject & { name?: string };
  info.measureProofJobInfoKind = 'measure-proof-job-info';
  info.measureProofJobInfoPage = pageIndex;
  info.measureProofJobInfo = { job: '', revision: '', prepared: '', notes: '' };
  info.name = `Measure Proof Job Info ${pageIndex}`;
  info.excludeFromExport = false;
  return group;
}

function proofPageScaleObject(bounds: { left: number; top: number; width: number; height: number }): fabric.Group {
  const lengthMm = 100;
  const lengthPx = lengthMm * MM_TO_PX;
  const objects: fabric.FabricObject[] = [
    new fabric.FabricText('100 mm scale check', {
      left: 0,
      top: 0,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
      fill: '#0f172a',
    }),
    new fabric.Line([0, 24, lengthPx, 24], { stroke: '#0f172a', strokeWidth: 1.5 }),
  ];
  for (let tick = 0; tick <= 10; tick += 1) {
    const x = (lengthPx / 10) * tick;
    const tall = tick % 5 === 0;
    objects.push(new fabric.Line([x, tall ? 14 : 18, x, 30], { stroke: '#0f172a', strokeWidth: tall ? 1.2 : 0.8 }));
    if (tall) {
      objects.push(new fabric.FabricText(`${tick * 10}`, {
        left: x,
        top: 34,
        originX: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 8,
        fill: '#0f172a',
      }));
    }
  }
  const group = new fabric.Group(objects, {
    left: bounds.left,
    top: bounds.top + bounds.height + 150,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const scale = group as MeasureProofScaleObject & { name?: string };
  scale.measureProofScaleKind = 'measure-proof-scale';
  scale.name = 'Measure Proof 100mm Scale';
  scale.excludeFromExport = false;
  return group;
}

function proofPageColorBarObject(bounds: { left: number; top: number; width: number; height: number }): fabric.Group {
  const swatches = [
    { label: 'C', fill: '#00aeef' },
    { label: 'M', fill: '#ec008c' },
    { label: 'Y', fill: '#fff200' },
    { label: 'K', fill: '#000000' },
    { label: 'R', fill: '#ef4444' },
    { label: 'G', fill: '#22c55e' },
    { label: 'B', fill: '#2563eb' },
    { label: '50%', fill: '#808080' },
  ];
  const objects: fabric.FabricObject[] = [new fabric.FabricText('Colour control', {
    left: 0,
    top: 0,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 11,
    fill: '#0f172a',
  })];
  for (const [index, swatch] of swatches.entries()) {
    const x = index * 24;
    objects.push(new fabric.Rect({ left: x, top: 18, width: 20, height: 16, fill: swatch.fill, stroke: '#0f172a', strokeWidth: 0.5 }));
    objects.push(new fabric.FabricText(swatch.label, {
      left: x + 10,
      top: 38,
      originX: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 8,
      fill: '#0f172a',
    }));
  }
  const group = new fabric.Group(objects, {
    left: bounds.left,
    top: bounds.top + bounds.height + 96,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const colorBar = group as MeasureProofColorBarObject & { name?: string };
  colorBar.measureProofColorBarKind = 'measure-proof-color-bar';
  colorBar.name = 'Measure Proof Colour Control';
  colorBar.excludeFromExport = false;
  return group;
}

function proofApprovalStyle(status: MeasureProofApprovalStatus): { label: string; detail: string; fill: string; stroke: string; text: string } {
  if (status === 'approved') return { label: 'APPROVED', detail: 'Ready for production', fill: 'rgba(220,252,231,0.96)', stroke: '#16a34a', text: '#166534' };
  if (status === 'changes') return { label: 'CHANGES REQUIRED', detail: 'Revise before output', fill: 'rgba(254,226,226,0.96)', stroke: '#dc2626', text: '#991b1b' };
  return { label: 'DRAFT PROOF', detail: 'Awaiting approval', fill: 'rgba(219,234,254,0.96)', stroke: '#2563eb', text: '#1d4ed8' };
}

function setProofApprovalVisuals(stamp: fabric.FabricObject, status: MeasureProofApprovalStatus): void {
  const style = proofApprovalStyle(status);
  const approval = stamp as MeasureProofApprovalObject & { name?: string };
  approval.measureProofApprovalKind = 'measure-proof-approval-stamp';
  approval.measureProofApprovalStatus = status;
  approval.name = `Measure Proof Approval Stamp ${style.label}`;
  approval.excludeFromExport = false;
  if (!(stamp instanceof fabric.Group)) return;
  for (const child of stamp.getObjects()) {
    const role = (child as { measureProofApprovalRole?: string }).measureProofApprovalRole;
    if (role === 'box') child.set({ fill: style.fill, stroke: style.stroke });
    else if (role === 'label' && child instanceof fabric.FabricText) child.set({ text: style.label, fill: style.text });
    else if (role === 'detail' && child instanceof fabric.FabricText) child.set({ text: style.detail, fill: style.text });
  }
}

function proofPageApprovalStampObject(bounds: { left: number; top: number; width: number; height: number }, pageIndex: number, status: MeasureProofApprovalStatus = 'draft'): fabric.Group {
  const style = proofApprovalStyle(status);
  const box = new fabric.Rect({ left: 0, top: 0, width: 150, height: 54, rx: 8, ry: 8, fill: style.fill, stroke: style.stroke, strokeWidth: 1.5 });
  (box as { measureProofApprovalRole?: string }).measureProofApprovalRole = 'box';
  const label = new fabric.FabricText(style.label, {
    left: 75,
    top: 10,
    originX: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    fontWeight: 'bold',
    fill: style.text,
  });
  (label as { measureProofApprovalRole?: string }).measureProofApprovalRole = 'label';
  const detail = new fabric.FabricText(style.detail, {
    left: 75,
    top: 32,
    originX: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 9,
    fill: style.text,
  });
  (detail as { measureProofApprovalRole?: string }).measureProofApprovalRole = 'detail';
  const page = new fabric.FabricText(`Proof ${pageIndex}`, {
    left: 75,
    top: 46,
    originX: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 8,
    fill: style.text,
  });
  const group = new fabric.Group([box, label, detail, page], {
    left: bounds.left + Math.max(0, bounds.width - 165),
    top: bounds.top - 154,
    backgroundColor: 'rgba(255,255,255,0)',
  });
  (group as MeasureProofApprovalObject).measureProofApprovalPage = pageIndex;
  setProofApprovalVisuals(group, status);
  return group;
}



function proofChecklistStates(status: MeasureProofApprovalStatus): MeasureProofChecklistState[] {
  if (status === 'approved') return ['checked', 'checked', 'checked', 'checked', 'checked'];
  if (status === 'changes') return ['checked', 'checked', 'checked', 'issue', 'issue'];
  return ['empty', 'empty', 'empty', 'empty', 'empty'];
}

function setProofChecklistStateVisuals(group: fabric.FabricObject, status: MeasureProofApprovalStatus): void {
  const checklist = group as MeasureProofChecklistObject;
  const states = proofChecklistStates(status);
  checklist.measureProofChecklistStatus = status;
  checklist.measureProofChecklistStates = states;
  if (!(group instanceof fabric.Group)) return;
  for (const child of group.getObjects()) {
    const index = (child as { measureProofChecklistItemIndex?: number }).measureProofChecklistItemIndex;
    const role = (child as { measureProofChecklistRole?: string }).measureProofChecklistRole;
    if (typeof index !== 'number') continue;
    const state = states[index] ?? 'empty';
    if (role === 'box') {
      child.set({ fill: state === 'checked' ? '#dcfce7' : state === 'issue' ? '#fee2e2' : '', stroke: state === 'checked' ? '#16a34a' : state === 'issue' ? '#dc2626' : '#0f172a' });
    } else if (role === 'label' && child instanceof fabric.FabricText) {
      const prefix = state === 'checked' ? '✓ ' : state === 'issue' ? '! ' : '';
      child.set({ text: `${prefix}${child.text?.replace(/^[✓!]\s+/, '') ?? ''}`, fill: state === 'checked' ? '#166534' : state === 'issue' ? '#991b1b' : '#0f172a' });
    }
  }
}

function proofSignoffText(signoff: MeasureProofSignoff = {}): string {
  const signer = proofJobInfoText(signoff.signer, '________________');
  const date = proofJobInfoText(signoff.date, '__________');
  const note = signoff.note?.trim();
  return note ? `Signature: ${signer} · Date: ${date} · ${note.slice(0, 60)}` : `Signature: ${signer} · Date: ${date}`;
}

function setProofChecklistSignoffVisuals(group: fabric.FabricObject, signoff: MeasureProofSignoff): void {
  const checklist = group as MeasureProofChecklistObject;
  checklist.measureProofSignoff = {
    signer: signoff.signer?.trim() ?? '',
    date: signoff.date?.trim() ?? '',
    note: signoff.note?.trim() ?? '',
  };
  if (!(group instanceof fabric.Group)) return;
  for (const child of group.getObjects()) {
    if ((child as { measureProofSignoffRole?: string }).measureProofSignoffRole === 'signoff' && child instanceof fabric.FabricText) child.set({ text: proofSignoffText(checklist.measureProofSignoff) });
  }
}

function proofPageChecklistObject(bounds: { left: number; top: number; width: number; height: number }, pageIndex: number): fabric.Group {
  const items = ['Size checked', 'Bleed checked', 'Colour checked', 'Cut/finish checked', 'Approved'];
  const objects: fabric.FabricObject[] = [
    new fabric.FabricText(`Proof ${pageIndex} approval`, {
      left: 0,
      top: 0,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fontWeight: 'bold',
      fill: '#0f172a',
    }),
  ];
  for (const [index, item] of items.entries()) {
    const y = 20 + index * 18;
    const box = new fabric.Rect({ left: 0, top: y, width: 10, height: 10, fill: '', stroke: '#0f172a', strokeWidth: 1 });
    (box as { measureProofChecklistRole?: string; measureProofChecklistItemIndex?: number }).measureProofChecklistRole = 'box';
    (box as { measureProofChecklistRole?: string; measureProofChecklistItemIndex?: number }).measureProofChecklistItemIndex = index;
    const label = new fabric.FabricText(item, {
      left: 16,
      top: y - 2,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
      fill: '#0f172a',
    });
    (label as { measureProofChecklistRole?: string; measureProofChecklistItemIndex?: number }).measureProofChecklistRole = 'label';
    (label as { measureProofChecklistRole?: string; measureProofChecklistItemIndex?: number }).measureProofChecklistItemIndex = index;
    objects.push(box, label);
  }
  objects.push(new fabric.Line([0, 118, 150, 118], { stroke: '#0f172a', strokeWidth: 1 }));
  const signoffText = new fabric.FabricText(proofSignoffText(), {
    left: 0,
    top: 122,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 10,
    fill: '#475569',
  });
  (signoffText as { measureProofSignoffRole?: string }).measureProofSignoffRole = 'signoff';
  objects.push(signoffText);
  const group = new fabric.Group(objects, {
    left: bounds.left + Math.max(0, bounds.width - 165),
    top: bounds.top + bounds.height + 34,
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const checklist = group as MeasureProofChecklistObject & { name?: string };
  checklist.measureProofChecklistKind = 'measure-proof-checklist';
  checklist.measureProofSignoff = { signer: '', date: '', note: '' };
  setProofChecklistStateVisuals(group, 'draft');
  checklist.name = `Measure Proof Checklist ${pageIndex}`;
  checklist.excludeFromExport = false;
  return group;
}

function proofPageLabelObject(bounds: { left: number; top: number; width: number; height: number }, pageIndex: number, marginMm: number, bleedMm: number): fabric.FabricText {
  const label = new fabric.FabricText(`Proof ${pageIndex} · ${(bounds.width / MM_TO_PX).toFixed(1)} × ${(bounds.height / MM_TO_PX).toFixed(1)} mm · margin ${marginMm.toFixed(1)} mm · bleed ${bleedMm.toFixed(1)} mm`, {
    left: bounds.left,
    top: bounds.top - 22,
    originX: 'left',
    originY: 'bottom',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#0f172a',
    backgroundColor: 'rgba(255,255,255,0.92)',
  });
  const proofLabel = label as MeasureProofLabelObject & { name?: string };
  proofLabel.measureProofLabelKind = 'measure-proof-label';
  proofLabel.name = `Measure Proof Label ${pageIndex}`;
  proofLabel.excludeFromExport = false;
  return label;
}

function selectionAreaLabelObject(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.Text {
  const areaMm2 = (bounds.width / MM_TO_PX) * (bounds.height / MM_TO_PX);
  const perimeterMm = 2 * ((bounds.width / MM_TO_PX) + (bounds.height / MM_TO_PX));
  return new fabric.Text(`Area ${areaMm2.toFixed(1)} mm²\nPerim ${perimeterMm.toFixed(1)} mm`, {
    left: (bounds.minX + bounds.maxX) / 2,
    top: (bounds.minY + bounds.maxY) / 2,
    originX: 'center',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.15,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
}

function selectionCenterMarkObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const arm = 10;
  return [
    new fabric.Line([cx - arm, cy, cx + arm, cy], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([cx, cy - arm, cx, cy + arm], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Circle({ left: cx, top: cy, radius: 3, originX: 'center', originY: 'center', fill: 'transparent', stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Text(`C ${ (cx / MM_TO_PX).toFixed(1)}, ${(cy / MM_TO_PX).toFixed(1)} mm`, {
      left: cx + 12,
      top: cy - 14,
      originX: 'left',
      originY: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fill: '#22d3ee',
      backgroundColor: 'rgba(11,18,32,0.85)',
    }),
  ];
}

function selectionCornerMarkObjects(bounds: NonNullable<ReturnType<typeof selectionBounds>>): fabric.FabricObject[] {
  const leg = 12;
  const corners: Array<[number, number, number, number]> = [
    [bounds.minX, bounds.minY, 1, 1],
    [bounds.maxX, bounds.minY, -1, 1],
    [bounds.maxX, bounds.maxY, -1, -1],
    [bounds.minX, bounds.maxY, 1, -1],
  ];
  return corners.flatMap(([x, y, sx, sy]) => [
    new fabric.Line([x, y, x + sx * leg, y], { stroke: '#22d3ee', strokeWidth: 1 }),
    new fabric.Line([x, y, x, y + sy * leg], { stroke: '#22d3ee', strokeWidth: 1 }),
  ]);
}

export function commitDimension(): boolean {
  const m = useEditor.getState().measure;
  const canvas = getCanvas();
  if (!m || !canvas) return false;
  const objects = dimensionAnnotationObjects(m);
  if (objects.length === 0) return false;
  const group = tagMeasureAnnotation(new fabric.Group(objects));
  canvas.add(group);
  canvas.setActiveObject(group);
  useEditor.getState().setMeasure(null);
  dragging = false;
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

export function addSelectionDimensions(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return 0;
  const bounds = selectionBounds(objects);
  if (!bounds) return 0;
  const group = tagMeasureAnnotation(new fabric.Group(selectionDimensionObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return 2;
}

export function addSelectionAreaLabel(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const label = tagMeasureAnnotation(selectionAreaLabelObject(bounds));
  canvas.add(label);
  canvas.setActiveObject(label);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionCenterMark(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const group = tagMeasureAnnotation(new fabric.Group(selectionCenterMarkObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionCornerMarks(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const group = tagMeasureAnnotation(new fabric.Group(selectionCornerMarkObjects(bounds)));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

export function addSelectionProductionMarks(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return 0;
  const group = tagMeasureAnnotation(new fabric.Group([
    ...selectionDimensionObjects(bounds),
    selectionAreaLabelObject(bounds),
    ...selectionCenterMarkObjects(bounds),
    ...selectionCornerMarkObjects(bounds),
  ]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return 4;
}


export function addSelectionMarginFrame(marginMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(marginMm) || marginMm < 0) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const marginPx = marginMm * MM_TO_PX;
  const frame = new fabric.Rect({
    left: bounds.minX - marginPx,
    top: bounds.minY - marginPx,
    width: bounds.width + marginPx * 2,
    height: bounds.height + marginPx * 2,
    fill: 'transparent',
    stroke: '#22d3ee',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    objectCaching: false,
  });
  const label = new fabric.Text(`Margin ${marginMm.toFixed(1)} mm`, {
    left: bounds.minX - marginPx,
    top: bounds.minY - marginPx - 14,
    originX: 'left',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
  const group = tagMeasureAnnotation(new fabric.Group([frame, label]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}


export function addSelectionInsetFrame(insetMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(insetMm) || insetMm < 0) return false;
  const objects = canvas.getActiveObjects();
  const bounds = selectionBounds(objects);
  if (!bounds) return false;
  const insetPx = insetMm * MM_TO_PX;
  const width = bounds.width - insetPx * 2;
  const height = bounds.height - insetPx * 2;
  if (width / MM_TO_PX < 0.1 || height / MM_TO_PX < 0.1) return false;
  const frame = new fabric.Rect({
    left: bounds.minX + insetPx,
    top: bounds.minY + insetPx,
    width,
    height,
    fill: 'transparent',
    stroke: '#22d3ee',
    strokeWidth: 1,
    strokeDashArray: [3, 3],
    objectCaching: false,
  });
  const label = new fabric.Text(`Inset ${insetMm.toFixed(1)} mm`, {
    left: bounds.minX + insetPx,
    top: bounds.minY + insetPx + 14,
    originX: 'left',
    originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    fill: '#22d3ee',
    backgroundColor: 'rgba(11,18,32,0.85)',
  });
  const group = tagMeasureAnnotation(new fabric.Group([frame, label]));
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

function measureAnnotationObjects(): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  return canvas.getObjects().filter((object) => (object as MeasureAnnotationObject).measureAnnotationKind === MEASURE_ANNOTATION_KIND);
}

function isMeasureProofSheetObject(object: fabric.FabricObject): boolean {
  const proofObject = object as MeasureProofMarkObject & MeasureProofLabelObject & MeasureProofFrameObject & MeasureProofLegendObject & MeasureProofChecklistObject & MeasureProofApprovalObject & MeasureProofColorBarObject & MeasureProofScaleObject & MeasureProofJobInfoObject & MeasureProofFilenameObject & MeasureProofPreflightObject & MeasureProofManifestObject & MeasureProofRevisionObject & MeasureProofAuditObject & MeasureProofCoverObject & MeasureProofDeliveryObject & MeasureProofReleaseObject & MeasureProofIndexObject & MeasureProofContactObject & MeasureProofScheduleObject & MeasureProofRouteObject & MeasureProofFulfillmentObject & MeasureProofInstallObject & MeasureProofSiteReadinessObject & MeasureProofPunchListObject & MeasureProofAcceptanceObject & MeasureProofWarrantyObject & MeasureProofCareObject & MeasureProofArchiveObject & MeasureProofVerificationObject & MeasureProofSpecsObject & MeasureProofSafetyObject;
  return proofObject.measureProofMarkKind === 'measure-proof-mark'
    || proofObject.measureProofLabelKind === 'measure-proof-label'
    || typeof proofObject.measureProofFrameKind === 'string'
    || proofObject.measureProofLegendKind === 'measure-proof-legend'
    || proofObject.measureProofChecklistKind === 'measure-proof-checklist'
    || proofObject.measureProofApprovalKind === 'measure-proof-approval-stamp'
    || proofObject.measureProofColorBarKind === 'measure-proof-color-bar'
    || proofObject.measureProofScaleKind === 'measure-proof-scale'
    || proofObject.measureProofJobInfoKind === 'measure-proof-job-info'
    || proofObject.measureProofFilenameKind === 'measure-proof-filename'
    || proofObject.measureProofPreflightKind === 'measure-proof-preflight'
    || proofObject.measureProofManifestKind === 'measure-proof-manifest'
    || proofObject.measureProofRevisionKind === 'measure-proof-revision-history'
    || proofObject.measureProofAuditKind === 'measure-proof-approval-audit'
    || proofObject.measureProofCoverKind === 'measure-proof-package-cover'
    || proofObject.measureProofDeliveryKind === 'measure-proof-delivery-checklist'
    || proofObject.measureProofReleaseKind === 'measure-proof-release-stamp'
    || proofObject.measureProofIndexKind === 'measure-proof-package-index'
    || proofObject.measureProofContactKind === 'measure-proof-delivery-contact'
    || proofObject.measureProofScheduleKind === 'measure-proof-delivery-schedule'
    || proofObject.measureProofRouteKind === 'measure-proof-delivery-route'
    || proofObject.measureProofFulfillmentKind === 'measure-proof-fulfillment-handoff'
    || proofObject.measureProofInstallKind === 'measure-proof-install-handoff'
    || proofObject.measureProofSiteReadinessKind === 'measure-proof-site-readiness'
    || proofObject.measureProofPunchListKind === 'measure-proof-install-punch-list'
    || proofObject.measureProofAcceptanceKind === 'measure-proof-client-acceptance'
    || proofObject.measureProofWarrantyKind === 'measure-proof-warranty-info'
    || proofObject.measureProofCareKind === 'measure-proof-care-instructions'
    || proofObject.measureProofArchiveKind === 'measure-proof-asset-archive'
    || proofObject.measureProofVerificationKind === 'measure-proof-file-verification'
    || proofObject.measureProofSpecsKind === 'measure-proof-specs'
    || proofObject.measureProofSafetyKind === 'measure-proof-safety';
}

function measureProofSheetObjects(): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  return canvas.getObjects().filter(isMeasureProofSheetObject);
}

function setMeasureAnnotationsLocked(locked: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      selectable: !locked,
      evented: !locked,
      hasControls: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
    });
  }
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

function setMeasureAnnotationsVisible(visible: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) object.set({ visible });
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function bringMeasureAnnotationsToFront(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  for (const object of matches) canvas.bringObjectToFront(object);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function proofMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      visible: true,
      selectable: false,
      evented: false,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });
    canvas.bringObjectToFront(object);
  }
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function editMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    object.set({
      visible: true,
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });
    canvas.bringObjectToFront(object);
  }
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export async function duplicateMeasureAnnotationsToSelection(): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const activeObjects = canvas.getActiveObjects();
  const targets = activeObjects.filter((object) => (object as MeasureAnnotationObject).measureAnnotationKind !== MEASURE_ANNOTATION_KIND);
  const bounds = selectionBounds(targets);
  const matches = measureAnnotationObjects();
  if (!bounds || matches.length === 0) return 0;
  const sourceBounds = selectionBounds(matches);
  if (!sourceBounds) return 0;
  const dx = bounds.minX + bounds.width / 2 - (sourceBounds.minX + sourceBounds.width / 2);
  const dy = bounds.minY + bounds.height / 2 - (sourceBounds.minY + sourceBounds.height / 2);
  const clones = await Promise.all(matches.map((object) => object.clone() as Promise<fabric.FabricObject>));
  if (clones.length === 0) return 0;
  canvas.discardActiveObject();
  for (const clone of clones) {
    tagMeasureAnnotation(clone);
    clone.set({
      left: (clone.left ?? 0) + dx,
      top: (clone.top ?? 0) + dy,
      visible: true,
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });
    clone.setCoords();
    canvas.add(clone);
    canvas.bringObjectToFront(clone);
  }
  if (clones.length === 1) canvas.setActiveObject(clones[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(clones, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return clones.length;
}

function makeMeasureAnnotationGuides(includeBounds: boolean, includeCenter: boolean, marginMm = 0): number {
  if (!Number.isFinite(marginMm) || marginMm < 0) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0 || (!includeBounds && !includeCenter)) return 0;
  const marginPx = marginMm * MM_TO_PX;
  const addGuide = useEditor.getState().addUserGuide;
  let count = 0;
  for (const object of matches) {
    const rect = object.getBoundingRect();
    if (includeBounds) {
      addGuide('v', rect.left - marginPx);
      addGuide('v', rect.left + rect.width + marginPx);
      addGuide('h', rect.top - marginPx);
      addGuide('h', rect.top + rect.height + marginPx);
      count += 4;
    }
    if (includeCenter) {
      addGuide('v', rect.left + rect.width / 2);
      addGuide('h', rect.top + rect.height / 2);
      count += 2;
    }
  }
  return count;
}

export function makeGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(true, false);
}

export function makeMarginGuidesFromMeasureAnnotations(marginMm: number): number {
  return makeMeasureAnnotationGuides(true, false, marginMm);
}

export function makeCenterGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(false, true);
}

export function makeFullGuidesFromMeasureAnnotations(): number {
  return makeMeasureAnnotationGuides(true, true);
}

export function makeMarginFullGuidesFromMeasureAnnotations(marginMm: number): number {
  return makeMeasureAnnotationGuides(true, true, marginMm);
}

export function addPrintMarksFromMeasureAnnotations(bleedMm = 3): number {
  if (!Number.isFinite(bleedMm) || bleedMm < 0) return 0;
  const canvas = getCanvas();
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!canvas || !bounds) return 0;
  const marks = createPrintMarkObjects({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }, { bleedMm });
  if (marks.length === 0) return 0;
  canvas.discardActiveObject();
  for (const mark of marks) canvas.add(mark);
  canvas.setActiveObject(marks.length === 1 ? marks[0] : new fabric.ActiveSelection(marks, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return marks.length;
}

export function addCutContourFromMeasureAnnotations(offsetMm = 0, passes = 1): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(passes) || passes < 1) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return 0;
  const state = useEditor.getState();
  state.addCutPaths([{
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]],
    closed: true,
    kind: 'outline',
    passes: Math.max(1, Math.round(passes)),
    color: '#ff00ff',
  }]);
  state.setCutPathsVisible(true);
  pushHistory();
  return 1;
}

export function addBridgedCutContourFromMeasureAnnotations(offsetMm = 0, bridgeCount = 4, gapMm = 1, passes = 1): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(bridgeCount) || bridgeCount < 1 || !Number.isFinite(gapMm) || gapMm <= 0 || !Number.isFinite(passes) || passes < 1) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return 0;
  const source = {
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: Math.max(1, Math.round(passes)),
    color: '#ff00ff',
  };
  const paths = addBridges([source], Math.floor(bridgeCount), gapMm);
  if (paths.length === 0 || (paths.length === 1 && paths[0].closed)) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addRegistrationMarksFromMeasureAnnotations(offsetMm = 5, armLengthMm = 10, insetMm = 5): number {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(armLengthMm) || armLengthMm <= 0 || !Number.isFinite(insetMm) || insetMm < 0) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const regBounds = {
    x: bounds.minX / MM_TO_PX - offsetMm,
    y: bounds.minY / MM_TO_PX - offsetMm,
    w: bounds.width / MM_TO_PX + offsetMm * 2,
    h: bounds.height / MM_TO_PX + offsetMm * 2,
  };
  if (regBounds.w <= 0 || regBounds.h <= 0) return 0;
  const state = useEditor.getState();
  state.clearCutPaths('regmark');
  state.addCutPaths(generateRegMarks({ bounds: regBounds, armLength: armLengthMm, inset: insetMm }));
  state.setCutPathsVisible(true);
  pushHistory();
  return 4;
}

export function addWeedBorderFromMeasureAnnotations(marginMm = 5, rows = 0, cols = 0): number {
  if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return 0;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return 0;
  const weedBounds = {
    x: bounds.minX / MM_TO_PX,
    y: bounds.minY / MM_TO_PX,
    w: bounds.width / MM_TO_PX,
    h: bounds.height / MM_TO_PX,
  };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return 0;
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  const paths = [generateWeedBorder(weedBounds, marginMm)];
  if (roundedRows > 0 || roundedCols > 0) paths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, marginMm));
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addGrommetsFromMeasureAnnotations(insetMm = 20, maxSpacingMm = 500, diameterMm = 10): number {
  const matches = measureAnnotationObjects();
  const paths = grommetsFromObjects(matches, insetMm, maxSpacingMm, diameterMm);
  if (paths.length === 0) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function addRhinestonesFromMeasureAnnotations(spacingMm = 4, diameterMm = 2.8): number {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0) return 0;
  const matches = measureAnnotationObjects();
  const paths = rhinestoneFromSelection(matches, spacingMm, diameterMm);
  if (paths.length === 0) return 0;
  const state = useEditor.getState();
  state.addCutPaths(paths);
  state.setCutPathsVisible(true);
  pushHistory();
  return paths.length;
}

export function preparePrintAndCutFromMeasureAnnotations(bleedMm = 3, contourOffsetMm = 0, regOffsetMm = 5, weedMarginMm = 5): { printMarks: number; cutPaths: number; guides: number } | null {
  if (!Number.isFinite(bleedMm) || bleedMm < 0 || !Number.isFinite(contourOffsetMm) || contourOffsetMm < 0 || !Number.isFinite(regOffsetMm) || regOffsetMm < 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0) return null;
  const canvas = getCanvas();
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!canvas || !bounds) return null;
  const printMarks = createPrintMarkObjects({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }, { bleedMm });
  const left = bounds.minX / MM_TO_PX - contourOffsetMm;
  const top = bounds.minY / MM_TO_PX - contourOffsetMm;
  const right = bounds.maxX / MM_TO_PX + contourOffsetMm;
  const bottom = bounds.maxY / MM_TO_PX + contourOffsetMm;
  if (right <= left || bottom <= top) return null;
  const contour = {
    id: `measure-contour-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: 1,
    color: '#ff00ff',
  };
  const regBounds = {
    x: bounds.minX / MM_TO_PX - regOffsetMm,
    y: bounds.minY / MM_TO_PX - regOffsetMm,
    w: bounds.width / MM_TO_PX + regOffsetMm * 2,
    h: bounds.height / MM_TO_PX + regOffsetMm * 2,
  };
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  const cutPaths = [contour, ...generateRegMarks({ bounds: regBounds, armLength: 10, inset: 5 }), generateWeedBorder(weedBounds, weedMarginMm)];
  canvas.discardActiveObject();
  for (const mark of printMarks) canvas.add(mark);
  if (printMarks.length === 1) canvas.setActiveObject(printMarks[0]);
  else if (printMarks.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(printMarks, { canvas }));
  const state = useEditor.getState();
  state.clearCutPaths('regmark');
  state.addCutPaths(cutPaths);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, bleedMm);
  canvas.requestRenderAll();
  pushHistory();
  return { printMarks: printMarks.length, cutPaths: cutPaths.length, guides };
}

export function prepareBannerFinishingFromMeasureAnnotations(insetMm = 20, maxSpacingMm = 500, diameterMm = 10, weedMarginMm = 5, rows = 0, cols = 0): { grommets: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(insetMm) || insetMm < 0 || !Number.isFinite(maxSpacingMm) || maxSpacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return null;
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!bounds) return null;
  const grommets = grommetsFromObjects(matches, insetMm, maxSpacingMm, diameterMm);
  if (grommets.length === 0) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  if (roundedRows > 0 || roundedCols > 0) weedPaths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, weedMarginMm));
  const state = useEditor.getState();
  state.addCutPaths([...grommets, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { grommets: grommets.length, weedPaths: weedPaths.length, guides };
}

export function prepareStencilCutFromMeasureAnnotations(offsetMm = 0, bridgeCount = 4, gapMm = 1, weedMarginMm = 5, rows = 0, cols = 0): { bridgedContours: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(offsetMm) || offsetMm < 0 || !Number.isFinite(bridgeCount) || bridgeCount < 1 || !Number.isFinite(gapMm) || gapMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0 || !Number.isFinite(rows) || rows < 0 || !Number.isFinite(cols) || cols < 0) return null;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return null;
  const left = bounds.minX / MM_TO_PX - offsetMm;
  const top = bounds.minY / MM_TO_PX - offsetMm;
  const right = bounds.maxX / MM_TO_PX + offsetMm;
  const bottom = bounds.maxY / MM_TO_PX + offsetMm;
  if (right <= left || bottom <= top) return null;
  const source = {
    id: `measure-stencil-${Date.now().toString(36)}`,
    points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] as Array<[number, number]>,
    closed: true,
    kind: 'outline' as const,
    passes: 1,
    color: '#ff00ff',
  };
  const bridgedContours = addBridges([source], Math.floor(bridgeCount), gapMm);
  if (bridgedContours.length === 0 || (bridgedContours.length === 1 && bridgedContours[0].closed)) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const roundedRows = Math.floor(rows);
  const roundedCols = Math.floor(cols);
  if (roundedRows > 0 || roundedCols > 0) weedPaths.push(...generateWeedLines(weedBounds, roundedRows, roundedCols, weedMarginMm));
  const state = useEditor.getState();
  state.addCutPaths([...bridgedContours, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { bridgedContours: bridgedContours.length, weedPaths: weedPaths.length, guides };
}

export function prepareRhinestoneTemplateFromMeasureAnnotations(spacingMm = 4, diameterMm = 2.8, weedMarginMm = 5): { stones: number; weedPaths: number; guides: number } | null {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0 || !Number.isFinite(diameterMm) || diameterMm <= 0 || !Number.isFinite(weedMarginMm) || weedMarginMm < 0) return null;
  const matches = measureAnnotationObjects();
  const bounds = selectionBounds(matches);
  if (!bounds) return null;
  const stones = rhinestoneFromSelection(matches, spacingMm, diameterMm);
  if (stones.length === 0) return null;
  const weedBounds = { x: bounds.minX / MM_TO_PX, y: bounds.minY / MM_TO_PX, w: bounds.width / MM_TO_PX, h: bounds.height / MM_TO_PX };
  if (weedBounds.w <= 0 || weedBounds.h <= 0) return null;
  const weedPaths = [generateWeedBorder(weedBounds, weedMarginMm)];
  const state = useEditor.getState();
  state.addCutPaths([...stones, ...weedPaths]);
  state.setCutPathsVisible(true);
  const guides = makeMeasureAnnotationGuides(true, true, weedMarginMm);
  pushHistory();
  return { stones: stones.length, weedPaths: weedPaths.length, guides };
}

export function prepareProofPageFromMeasureAnnotations(marginMm = 5, bleedMm = 3): { artboard: boolean; printMarks: number; proofLabels: number; proofFrames: number; proofLegends: number; proofChecklists: number; proofApprovalStamps: number; proofColorBars: number; proofScales: number; proofJobInfos: number; proofFilenames: number; proofPreflights: number; proofManifests: number; proofRevisions: number; proofAudits: number; proofCovers: number; proofDeliveries: number; proofReleases: number; proofIndexes: number; proofContacts: number; proofSchedules: number; proofRoutes: number; proofFulfillments: number; proofInstalls: number; proofSiteReadinesses: number; proofPunchLists: number; proofAcceptances: number; proofWarranties: number; proofCares: number; proofArchives: number; proofVerifications: number; proofSpecs: number; proofSafetyNotes: number; guides: number } | null {
  if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(bleedMm) || bleedMm < 0) return null;
  const canvas = getCanvas();
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!canvas || !bounds) return null;
  const marginPx = marginMm * MM_TO_PX;
  const proofBounds = {
    left: bounds.minX - marginPx,
    top: bounds.minY - marginPx,
    width: bounds.width + marginPx * 2,
    height: bounds.height + marginPx * 2,
  };
  if (proofBounds.width <= 0 || proofBounds.height <= 0) return null;
  const printMarks = tagMeasureProofMarks(createPrintMarkObjects(proofBounds, { bleedMm }));
  const state = useEditor.getState();
  const index = state.artboards.length + 1;
  const proofLabels = [proofPageLabelObject(proofBounds, index, marginMm, bleedMm)];
  const proofFrames = proofPageFrameObjects(proofBounds, bounds);
  const proofLegends = [proofPageLegendObject(proofBounds, bleedMm)];
  const proofChecklists = [proofPageChecklistObject(proofBounds, index)];
  const proofApprovalStamps = [proofPageApprovalStampObject(proofBounds, index)];
  const proofColorBars = [proofPageColorBarObject(proofBounds)];
  const proofScales = [proofPageScaleObject(proofBounds)];
  const proofJobInfos = [proofPageJobInfoObject(proofBounds, index)];
  const proofFilenames = [proofPageFilenameObject(proofBounds, index)];
  const proofPreflights = [proofPagePreflightObject(proofBounds, bounds, marginMm, bleedMm, index)];
  const proofManifests: fabric.FabricObject[] = [];
  const proofRevisions: fabric.FabricObject[] = [];
  const proofAudits: fabric.FabricObject[] = [];
  const proofCovers: fabric.FabricObject[] = [];
  const proofDeliveries: fabric.FabricObject[] = [];
  const proofReleases: fabric.FabricObject[] = [];
  const proofIndexes: fabric.FabricObject[] = [];
  const proofContacts: fabric.FabricObject[] = [];
  const proofSchedules: fabric.FabricObject[] = [];
  const proofRoutes: fabric.FabricObject[] = [];
  const proofFulfillments: fabric.FabricObject[] = [];
  const proofInstalls: fabric.FabricObject[] = [];
  const proofSiteReadinesses: fabric.FabricObject[] = [];
  const proofPunchLists: fabric.FabricObject[] = [];
  const proofAcceptances: fabric.FabricObject[] = [];
  const proofWarranties: fabric.FabricObject[] = [];
  const proofCares: fabric.FabricObject[] = [];
  const proofArchives: fabric.FabricObject[] = [];
  const proofVerifications: fabric.FabricObject[] = [];
  const proofSpecs = [proofPageSpecsObject(proofBounds, bounds, marginMm, bleedMm)];
  const proofSafetyNotes = [proofPageSafetyObject(proofBounds, marginMm)];
  state.setArtboards([
    ...state.artboards,
    {
      id: `ab-proof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Measure Proof Page ${index} +${marginMm.toFixed(1)}mm`,
      x: proofBounds.left,
      y: proofBounds.top,
      width: proofBounds.width,
      height: proofBounds.height,
    },
  ]);
  canvas.discardActiveObject();
  const proofObjects = [...printMarks, ...proofFrames, ...proofLabels, ...proofLegends, ...proofChecklists, ...proofApprovalStamps, ...proofColorBars, ...proofScales, ...proofJobInfos, ...proofFilenames, ...proofPreflights, ...proofManifests, ...proofRevisions, ...proofAudits, ...proofCovers, ...proofDeliveries, ...proofReleases, ...proofIndexes, ...proofContacts, ...proofSchedules, ...proofRoutes, ...proofFulfillments, ...proofInstalls, ...proofSiteReadinesses, ...proofPunchLists, ...proofAcceptances, ...proofWarranties, ...proofCares, ...proofArchives, ...proofVerifications, ...proofSpecs, ...proofSafetyNotes];
  for (const object of proofObjects) canvas.add(object);
  for (const manifest of proofManifests) setProofManifestVisuals(manifest);
  for (const revision of proofRevisions) setProofRevisionVisuals(revision);
  for (const audit of proofAudits) setProofAuditVisuals(audit);
  for (const cover of proofCovers) setProofCoverVisuals(cover);
  for (const delivery of proofDeliveries) setProofDeliveryVisuals(delivery);
  for (const release of proofReleases) setProofReleaseVisuals(release);
  for (const index of proofIndexes) setProofIndexVisuals(index);
  for (const contact of proofContacts) setProofContactVisuals(contact);
  for (const schedule of proofSchedules) setProofScheduleVisuals(schedule);
  for (const route of proofRoutes) setProofRouteVisuals(route);
  for (const fulfillment of proofFulfillments) setProofFulfillmentVisuals(fulfillment);
  for (const install of proofInstalls) setProofInstallVisuals(install);
  for (const readiness of proofSiteReadinesses) setProofSiteReadinessVisuals(readiness);
  for (const punchList of proofPunchLists) setProofPunchListVisuals(punchList);
  for (const acceptance of proofAcceptances) setProofAcceptanceVisuals(acceptance);
  for (const warranty of proofWarranties) setProofWarrantyVisuals(warranty);
  for (const care of proofCares) setProofCareVisuals(care);
  for (const archive of proofArchives) setProofArchiveVisuals(archive);
  for (const verification of proofVerifications) setProofVerificationVisuals(verification);
  if (proofObjects.length === 1) canvas.setActiveObject(proofObjects[0]);
  else if (proofObjects.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(proofObjects, { canvas }));
  const guides = makeMeasureAnnotationGuides(true, true, marginMm);
  canvas.requestRenderAll();
  pushHistory();
  return { artboard: true, printMarks: printMarks.length, proofLabels: proofLabels.length, proofFrames: proofFrames.length, proofLegends: proofLegends.length, proofChecklists: proofChecklists.length, proofApprovalStamps: proofApprovalStamps.length, proofColorBars: proofColorBars.length, proofScales: proofScales.length, proofJobInfos: proofJobInfos.length, proofFilenames: proofFilenames.length, proofPreflights: proofPreflights.length, proofManifests: proofManifests.length, proofRevisions: proofRevisions.length, proofAudits: proofAudits.length, proofCovers: proofCovers.length, proofDeliveries: proofDeliveries.length, proofReleases: proofReleases.length, proofIndexes: proofIndexes.length, proofContacts: proofContacts.length, proofSchedules: proofSchedules.length, proofRoutes: proofRoutes.length, proofFulfillments: proofFulfillments.length, proofInstalls: proofInstalls.length, proofSiteReadinesses: proofSiteReadinesses.length, proofPunchLists: proofPunchLists.length, proofAcceptances: proofAcceptances.length, proofWarranties: proofWarranties.length, proofCares: proofCares.length, proofArchives: proofArchives.length, proofVerifications: proofVerifications.length, proofSpecs: proofSpecs.length, proofSafetyNotes: proofSafetyNotes.length, guides };
}

export function prepareProofPagesFromMeasureAnnotations(marginMm = 5, bleedMm = 3): { artboards: number; printMarks: number; proofLabels: number; proofFrames: number; proofLegends: number; proofChecklists: number; proofApprovalStamps: number; proofColorBars: number; proofScales: number; proofJobInfos: number; proofFilenames: number; proofPreflights: number; proofManifests: number; proofRevisions: number; proofAudits: number; proofCovers: number; proofDeliveries: number; proofReleases: number; proofIndexes: number; proofContacts: number; proofSchedules: number; proofRoutes: number; proofFulfillments: number; proofInstalls: number; proofSiteReadinesses: number; proofPunchLists: number; proofAcceptances: number; proofWarranties: number; proofCares: number; proofArchives: number; proofVerifications: number; proofSpecs: number; proofSafetyNotes: number; guides: number } | null {
  if (!Number.isFinite(marginMm) || marginMm < 0 || !Number.isFinite(bleedMm) || bleedMm < 0) return null;
  const canvas = getCanvas();
  const matches = measureAnnotationObjects();
  if (!canvas || matches.length === 0) return null;
  const marginPx = marginMm * MM_TO_PX;
  const state = useEditor.getState();
  const baseIndex = state.artboards.length;
  const artboards = [];
  const printMarks: fabric.FabricObject[] = [];
  const proofLabels: fabric.FabricObject[] = [];
  const proofFrames: fabric.FabricObject[] = [];
  const proofLegends: fabric.FabricObject[] = [];
  const proofChecklists: fabric.FabricObject[] = [];
  const proofApprovalStamps: fabric.FabricObject[] = [];
  const proofColorBars: fabric.FabricObject[] = [];
  const proofScales: fabric.FabricObject[] = [];
  const proofJobInfos: fabric.FabricObject[] = [];
  const proofFilenames: fabric.FabricObject[] = [];
  const proofPreflights: fabric.FabricObject[] = [];
  const proofManifests: fabric.FabricObject[] = [];
  const proofRevisions: fabric.FabricObject[] = [];
  const proofAudits: fabric.FabricObject[] = [];
  const proofCovers: fabric.FabricObject[] = [];
  const proofDeliveries: fabric.FabricObject[] = [];
  const proofReleases: fabric.FabricObject[] = [];
  const proofIndexes: fabric.FabricObject[] = [];
  const proofContacts: fabric.FabricObject[] = [];
  const proofSchedules: fabric.FabricObject[] = [];
  const proofRoutes: fabric.FabricObject[] = [];
  const proofFulfillments: fabric.FabricObject[] = [];
  const proofInstalls: fabric.FabricObject[] = [];
  const proofSiteReadinesses: fabric.FabricObject[] = [];
  const proofPunchLists: fabric.FabricObject[] = [];
  const proofAcceptances: fabric.FabricObject[] = [];
  const proofWarranties: fabric.FabricObject[] = [];
  const proofCares: fabric.FabricObject[] = [];
  const proofArchives: fabric.FabricObject[] = [];
  const proofVerifications: fabric.FabricObject[] = [];
  const proofSpecs: fabric.FabricObject[] = [];
  const proofSafetyNotes: fabric.FabricObject[] = [];
  for (const [annotationIndex, object] of matches.entries()) {
    const rect = object.getBoundingRect();
    const proofBounds = {
      left: rect.left - marginPx,
      top: rect.top - marginPx,
      width: rect.width + marginPx * 2,
      height: rect.height + marginPx * 2,
    };
    if (proofBounds.width <= 0 || proofBounds.height <= 0) continue;
    const pageIndex = baseIndex + annotationIndex + 1;
    artboards.push({
      id: `ab-proof-${Date.now().toString(36)}-${annotationIndex}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Measure Proof Page ${pageIndex} +${marginMm.toFixed(1)}mm`,
      x: proofBounds.left,
      y: proofBounds.top,
      width: proofBounds.width,
      height: proofBounds.height,
    });
    printMarks.push(...tagMeasureProofMarks(createPrintMarkObjects(proofBounds, { bleedMm })));
    proofFrames.push(...proofPageFrameObjects(proofBounds, { minX: rect.left, minY: rect.top, width: rect.width, height: rect.height }));
    proofLabels.push(proofPageLabelObject(proofBounds, pageIndex, marginMm, bleedMm));
    proofLegends.push(proofPageLegendObject(proofBounds, bleedMm));
    proofChecklists.push(proofPageChecklistObject(proofBounds, pageIndex));
    proofApprovalStamps.push(proofPageApprovalStampObject(proofBounds, pageIndex));
    proofColorBars.push(proofPageColorBarObject(proofBounds));
    proofScales.push(proofPageScaleObject(proofBounds));
    proofJobInfos.push(proofPageJobInfoObject(proofBounds, pageIndex));
    proofFilenames.push(proofPageFilenameObject(proofBounds, pageIndex));
    proofPreflights.push(proofPagePreflightObject(proofBounds, { width: rect.width, height: rect.height }, marginMm, bleedMm, pageIndex));
    proofSpecs.push(proofPageSpecsObject(proofBounds, { width: rect.width, height: rect.height }, marginMm, bleedMm));
    proofSafetyNotes.push(proofPageSafetyObject(proofBounds, marginMm));
  }
  if (artboards.length === 0) return null;
  const manifestBounds = selectionBounds([...proofLabels, ...proofFilenames, ...proofJobInfos]) ?? selectionBounds(matches);
  if (manifestBounds) {
    proofManifests.push(proofManifestObject(manifestBounds));
    proofRevisions.push(proofRevisionObject(manifestBounds));
    proofAudits.push(proofAuditObject(manifestBounds));
    proofCovers.push(proofCoverObject(manifestBounds));
    proofDeliveries.push(proofDeliveryObject(manifestBounds));
    proofReleases.push(proofReleaseObject(manifestBounds));
    proofIndexes.push(proofIndexObject(manifestBounds));
    proofContacts.push(proofContactObject(manifestBounds));
    proofSchedules.push(proofScheduleObject(manifestBounds));
    proofRoutes.push(proofRouteObject(manifestBounds));
    proofFulfillments.push(proofFulfillmentObject(manifestBounds));
    proofInstalls.push(proofInstallObject(manifestBounds));
    proofSiteReadinesses.push(proofSiteReadinessObject(manifestBounds));
    proofPunchLists.push(proofPunchListObject(manifestBounds));
    proofAcceptances.push(proofAcceptanceObject(manifestBounds));
    proofWarranties.push(proofWarrantyObject(manifestBounds));
    proofCares.push(proofCareObject(manifestBounds));
    proofArchives.push(proofArchiveObject(manifestBounds));
    proofVerifications.push(proofVerificationObject(manifestBounds));
  }
  state.setArtboards([...state.artboards, ...artboards]);
  canvas.discardActiveObject();
  const proofObjects = [...printMarks, ...proofFrames, ...proofLabels, ...proofLegends, ...proofChecklists, ...proofApprovalStamps, ...proofColorBars, ...proofScales, ...proofJobInfos, ...proofFilenames, ...proofPreflights, ...proofManifests, ...proofRevisions, ...proofAudits, ...proofCovers, ...proofDeliveries, ...proofReleases, ...proofIndexes, ...proofContacts, ...proofSchedules, ...proofRoutes, ...proofFulfillments, ...proofInstalls, ...proofSiteReadinesses, ...proofPunchLists, ...proofAcceptances, ...proofWarranties, ...proofCares, ...proofArchives, ...proofVerifications, ...proofSpecs, ...proofSafetyNotes];
  for (const object of proofObjects) canvas.add(object);
  for (const manifest of proofManifests) setProofManifestVisuals(manifest);
  for (const revision of proofRevisions) setProofRevisionVisuals(revision);
  for (const audit of proofAudits) setProofAuditVisuals(audit);
  for (const cover of proofCovers) setProofCoverVisuals(cover);
  for (const delivery of proofDeliveries) setProofDeliveryVisuals(delivery);
  for (const release of proofReleases) setProofReleaseVisuals(release);
  for (const index of proofIndexes) setProofIndexVisuals(index);
  for (const contact of proofContacts) setProofContactVisuals(contact);
  for (const schedule of proofSchedules) setProofScheduleVisuals(schedule);
  for (const route of proofRoutes) setProofRouteVisuals(route);
  for (const fulfillment of proofFulfillments) setProofFulfillmentVisuals(fulfillment);
  for (const install of proofInstalls) setProofInstallVisuals(install);
  for (const readiness of proofSiteReadinesses) setProofSiteReadinessVisuals(readiness);
  for (const punchList of proofPunchLists) setProofPunchListVisuals(punchList);
  for (const acceptance of proofAcceptances) setProofAcceptanceVisuals(acceptance);
  for (const warranty of proofWarranties) setProofWarrantyVisuals(warranty);
  for (const care of proofCares) setProofCareVisuals(care);
  for (const archive of proofArchives) setProofArchiveVisuals(archive);
  for (const verification of proofVerifications) setProofVerificationVisuals(verification);
  if (proofObjects.length === 1) canvas.setActiveObject(proofObjects[0]);
  else if (proofObjects.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(proofObjects, { canvas }));
  const guides = makeMeasureAnnotationGuides(true, true, marginMm);
  canvas.requestRenderAll();
  pushHistory();
  return { artboards: artboards.length, printMarks: printMarks.length, proofLabels: proofLabels.length, proofFrames: proofFrames.length, proofLegends: proofLegends.length, proofChecklists: proofChecklists.length, proofApprovalStamps: proofApprovalStamps.length, proofColorBars: proofColorBars.length, proofScales: proofScales.length, proofJobInfos: proofJobInfos.length, proofFilenames: proofFilenames.length, proofPreflights: proofPreflights.length, proofManifests: proofManifests.length, proofRevisions: proofRevisions.length, proofAudits: proofAudits.length, proofCovers: proofCovers.length, proofDeliveries: proofDeliveries.length, proofReleases: proofReleases.length, proofIndexes: proofIndexes.length, proofContacts: proofContacts.length, proofSchedules: proofSchedules.length, proofRoutes: proofRoutes.length, proofFulfillments: proofFulfillments.length, proofInstalls: proofInstalls.length, proofSiteReadinesses: proofSiteReadinesses.length, proofPunchLists: proofPunchLists.length, proofAcceptances: proofAcceptances.length, proofWarranties: proofWarranties.length, proofCares: proofCares.length, proofArchives: proofArchives.length, proofVerifications: proofVerifications.length, proofSpecs: proofSpecs.length, proofSafetyNotes: proofSafetyNotes.length, guides };
}

function measureAnnotationArtboardBounds(marginMm: number): { x: number; y: number; width: number; height: number; centerX: number; centerY: number } | null {
  if (!Number.isFinite(marginMm) || marginMm < 0) return null;
  const bounds = selectionBounds(measureAnnotationObjects());
  if (!bounds) return null;
  const marginPx = marginMm * MM_TO_PX;
  return {
    x: bounds.minX - marginPx,
    y: bounds.minY - marginPx,
    width: bounds.width + marginPx * 2,
    height: bounds.height + marginPx * 2,
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
  };
}

function addMeasureAnnotationArtboard(marginMm: number): boolean {
  const nextBounds = measureAnnotationArtboardBounds(marginMm);
  if (!nextBounds) return false;
  const state = useEditor.getState();
  const artboards = state.artboards;
  const index = artboards.length + 1;
  state.setArtboards([
    ...artboards,
    {
      id: `ab-measure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: marginMm > 0 ? `Measure Proof ${index} +${marginMm.toFixed(1)}mm` : `Measure Proof ${index}`,
      x: nextBounds.x,
      y: nextBounds.y,
      width: nextBounds.width,
      height: nextBounds.height,
    },
  ]);
  pushHistory();
  return true;
}

export function makeArtboardFromMeasureAnnotations(): boolean {
  return addMeasureAnnotationArtboard(0);
}

export function makeMarginArtboardFromMeasureAnnotations(marginMm: number): boolean {
  return addMeasureAnnotationArtboard(marginMm);
}

export function resizeArtboardToMeasureAnnotations(marginMm = 0): boolean {
  const nextBounds = measureAnnotationArtboardBounds(marginMm);
  if (!nextBounds) return false;
  const state = useEditor.getState();
  const artboards = state.artboards;
  if (artboards.length === 0) return false;
  const targetIndex = artboards.findIndex((artboard) => (
    nextBounds.centerX >= artboard.x
    && nextBounds.centerX <= artboard.x + artboard.width
    && nextBounds.centerY >= artboard.y
    && nextBounds.centerY <= artboard.y + artboard.height
  ));
  const index = targetIndex >= 0 ? targetIndex : 0;
  state.setArtboards(artboards.map((artboard, artboardIndex) => (artboardIndex === index
    ? { ...artboard, x: nextBounds.x, y: nextBounds.y, width: nextBounds.width, height: nextBounds.height }
    : artboard
  )));
  pushHistory();
  return true;
}


function selectFabricObjects(objects: fabric.FabricObject[]): number {
  const canvas = getCanvas();
  if (!canvas || objects.length === 0) return 0;
  canvas.discardActiveObject();
  if (objects.length === 1) canvas.setActiveObject(objects[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
  canvas.requestRenderAll();
  return objects.length;
}

export function selectMeasureProofObjectsByStatus(status: MeasureProofApprovalStatus): number {
  const objects = measureProofSheetObjects();
  const pages = new Set<number>();
  for (const object of objects) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalStatus === status && approval.measureProofApprovalPage) pages.add(approval.measureProofApprovalPage);
  }
  if (pages.size === 0) return 0;
  const matches = objects.filter((object) => {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp') return pages.has(approval.measureProofApprovalPage ?? -1);
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist') return checklist.measureProofChecklistStatus === status;
    const preflight = object as MeasureProofPreflightObject;
    if (preflight.measureProofPreflightKind === 'measure-proof-preflight') return pages.has(preflight.measureProofPreflightPage ?? -1);
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename') return pages.has(filename.measureProofFilenamePage ?? -1);
    const jobInfo = object as MeasureProofJobInfoObject;
    if (jobInfo.measureProofJobInfoKind === 'measure-proof-job-info') return pages.has(jobInfo.measureProofJobInfoPage ?? -1);
    return false;
  });
  return selectFabricObjects(matches);
}

export function selectMeasureProofDeliveryBlockers(): number {
  const objects = measureProofSheetObjects();
  const blockerPages = new Set<number>();
  let hasJobInfoBlocker = false;
  let checklistPage = 0;
  for (const object of objects) {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalStatus !== 'approved' && approval.measureProofApprovalPage) blockerPages.add(approval.measureProofApprovalPage);
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist') {
      checklistPage += 1;
      if (!checklist.measureProofSignoff?.signer || !checklist.measureProofSignoff?.date) blockerPages.add(checklistPage);
    }
    const jobInfo = object as MeasureProofJobInfoObject;
    if (jobInfo.measureProofJobInfoKind === 'measure-proof-job-info' && (!jobInfo.measureProofJobInfo?.job || !jobInfo.measureProofJobInfo?.revision || !jobInfo.measureProofJobInfo?.prepared)) {
      hasJobInfoBlocker = true;
      if (jobInfo.measureProofJobInfoPage) blockerPages.add(jobInfo.measureProofJobInfoPage);
    }
  }
  const matches = objects.filter((object) => {
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp') return blockerPages.has(approval.measureProofApprovalPage ?? -1);
    const checklist = object as MeasureProofChecklistObject;
    if (checklist.measureProofChecklistKind === 'measure-proof-checklist') return checklist.measureProofChecklistStatus !== 'approved' || !checklist.measureProofSignoff?.signer || !checklist.measureProofSignoff?.date;
    const preflight = object as MeasureProofPreflightObject;
    if (preflight.measureProofPreflightKind === 'measure-proof-preflight') return blockerPages.has(preflight.measureProofPreflightPage ?? -1);
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename') return blockerPages.has(filename.measureProofFilenamePage ?? -1) || !filename.measureProofFilename;
    const jobInfo = object as MeasureProofJobInfoObject;
    if (jobInfo.measureProofJobInfoKind === 'measure-proof-job-info') return hasJobInfoBlocker || blockerPages.has(jobInfo.measureProofJobInfoPage ?? -1);
    const audit = object as MeasureProofAuditObject;
    if (audit.measureProofAuditKind === 'measure-proof-approval-audit') return blockerPages.size > 0 || hasJobInfoBlocker;
    const cover = object as MeasureProofCoverObject;
    if (cover.measureProofCoverKind === 'measure-proof-package-cover') return blockerPages.size > 0 || hasJobInfoBlocker;
    const delivery = object as MeasureProofDeliveryObject;
    if (delivery.measureProofDeliveryKind === 'measure-proof-delivery-checklist') return blockerPages.size > 0 || hasJobInfoBlocker;
    return false;
  });
  return selectFabricObjects(matches);
}

export function selectMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

export function clearMeasureAnnotations(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureAnnotationObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) canvas.remove(object);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

function refreshMeasureProofManifests(): void {
  for (const object of measureProofSheetObjects()) {
    const manifest = object as MeasureProofManifestObject;
    if (manifest.measureProofManifestKind === 'measure-proof-manifest') setProofManifestVisuals(object);
    const revision = object as MeasureProofRevisionObject;
    if (revision.measureProofRevisionKind === 'measure-proof-revision-history') setProofRevisionVisuals(object);
    const audit = object as MeasureProofAuditObject;
    if (audit.measureProofAuditKind === 'measure-proof-approval-audit') setProofAuditVisuals(object);
    const cover = object as MeasureProofCoverObject;
    if (cover.measureProofCoverKind === 'measure-proof-package-cover') setProofCoverVisuals(object);
    const delivery = object as MeasureProofDeliveryObject;
    if (delivery.measureProofDeliveryKind === 'measure-proof-delivery-checklist') setProofDeliveryVisuals(object);
    const release = object as MeasureProofReleaseObject;
    if (release.measureProofReleaseKind === 'measure-proof-release-stamp') setProofReleaseVisuals(object);
    const index = object as MeasureProofIndexObject;
    if (index.measureProofIndexKind === 'measure-proof-package-index') setProofIndexVisuals(object);
    const contact = object as MeasureProofContactObject;
    if (contact.measureProofContactKind === 'measure-proof-delivery-contact') setProofContactVisuals(object, contact.measureProofContact ?? {});
    const schedule = object as MeasureProofScheduleObject;
    if (schedule.measureProofScheduleKind === 'measure-proof-delivery-schedule') setProofScheduleVisuals(object, schedule.measureProofSchedule ?? {});
    const route = object as MeasureProofRouteObject;
    if (route.measureProofRouteKind === 'measure-proof-delivery-route') setProofRouteVisuals(object, route.measureProofRoute ?? {});
    const fulfillment = object as MeasureProofFulfillmentObject;
    if (fulfillment.measureProofFulfillmentKind === 'measure-proof-fulfillment-handoff') setProofFulfillmentVisuals(object, fulfillment.measureProofFulfillment ?? {});
    const install = object as MeasureProofInstallObject;
    if (install.measureProofInstallKind === 'measure-proof-install-handoff') setProofInstallVisuals(object, install.measureProofInstall ?? {});
    const readiness = object as MeasureProofSiteReadinessObject;
    if (readiness.measureProofSiteReadinessKind === 'measure-proof-site-readiness') setProofSiteReadinessVisuals(object, readiness.measureProofSiteReadiness ?? {});
    const punchList = object as MeasureProofPunchListObject;
    if (punchList.measureProofPunchListKind === 'measure-proof-install-punch-list') setProofPunchListVisuals(object, punchList.measureProofPunchList ?? {});
    const acceptance = object as MeasureProofAcceptanceObject;
    if (acceptance.measureProofAcceptanceKind === 'measure-proof-client-acceptance') setProofAcceptanceVisuals(object, acceptance.measureProofAcceptance ?? {});
    const warranty = object as MeasureProofWarrantyObject;
    if (warranty.measureProofWarrantyKind === 'measure-proof-warranty-info') setProofWarrantyVisuals(object, warranty.measureProofWarranty ?? {});
    const care = object as MeasureProofCareObject;
    if (care.measureProofCareKind === 'measure-proof-care-instructions') setProofCareVisuals(object, care.measureProofCare ?? {});
    const archive = object as MeasureProofArchiveObject;
    if (archive.measureProofArchiveKind === 'measure-proof-asset-archive') setProofArchiveVisuals(object, archive.measureProofArchive ?? {});
    const verification = object as MeasureProofVerificationObject;
    if (verification.measureProofVerificationKind === 'measure-proof-file-verification') setProofVerificationVisuals(object, verification.measureProofVerification ?? {});
  }
}

function refreshMeasureProofFilenames(): void {
  const objects = measureProofSheetObjects();
  const jobInfoByPage = new Map<number, MeasureProofJobInfo>();
  const statusByPage = new Map<number, MeasureProofApprovalStatus>();
  const filenameByPage = new Map<number, string>();
  for (const object of objects) {
    const jobInfo = object as MeasureProofJobInfoObject;
    if (jobInfo.measureProofJobInfoKind === 'measure-proof-job-info' && jobInfo.measureProofJobInfoPage) jobInfoByPage.set(jobInfo.measureProofJobInfoPage, jobInfo.measureProofJobInfo ?? {});
    const approval = object as MeasureProofApprovalObject;
    if (approval.measureProofApprovalKind === 'measure-proof-approval-stamp' && approval.measureProofApprovalPage) statusByPage.set(approval.measureProofApprovalPage, approval.measureProofApprovalStatus ?? 'draft');
  }
  for (const object of objects) {
    const manifest = object as MeasureProofManifestObject;
    if (manifest.measureProofManifestKind === 'measure-proof-manifest') setProofManifestVisuals(object);
    const preflight = object as MeasureProofPreflightObject;
    if (preflight.measureProofPreflightKind === 'measure-proof-preflight') {
      const pageIndex = preflight.measureProofPreflightPage ?? 1;
      setProofPreflightVisuals(object, filenameByPage.get(pageIndex) ?? '', statusByPage.get(pageIndex) ?? 'draft');
    }
    const filename = object as MeasureProofFilenameObject;
    if (filename.measureProofFilenameKind === 'measure-proof-filename') {
      const pageIndex = filename.measureProofFilenamePage ?? 1;
      setProofFilenameVisuals(object, jobInfoByPage.get(pageIndex), statusByPage.get(pageIndex) ?? 'draft');
      filenameByPage.set(pageIndex, filename.measureProofFilename ?? '');
    }
  }
}

export function addMeasureProofManifest(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const manifests = measureProofSheetObjects().filter((object) => (object as MeasureProofManifestObject).measureProofManifestKind === 'measure-proof-manifest');
  if (manifests.length > 0) {
    for (const manifest of manifests) setProofManifestVisuals(manifest);
    canvas.requestRenderAll();
    pushHistory();
    return manifests.length;
  }
  const manifest = proofManifestObject(bounds);
  canvas.add(manifest);
  canvas.setActiveObject(manifest);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofRevisionHistory(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const revisions = measureProofSheetObjects().filter((object) => (object as MeasureProofRevisionObject).measureProofRevisionKind === 'measure-proof-revision-history');
  if (revisions.length > 0) {
    for (const revision of revisions) setProofRevisionVisuals(revision);
    canvas.requestRenderAll();
    pushHistory();
    return revisions.length;
  }
  const revision = proofRevisionObject(bounds);
  canvas.add(revision);
  canvas.setActiveObject(revision);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofApprovalAudit(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const audits = measureProofSheetObjects().filter((object) => (object as MeasureProofAuditObject).measureProofAuditKind === 'measure-proof-approval-audit');
  if (audits.length > 0) {
    for (const audit of audits) setProofAuditVisuals(audit);
    canvas.requestRenderAll();
    pushHistory();
    return audits.length;
  }
  const audit = proofAuditObject(bounds);
  canvas.add(audit);
  canvas.setActiveObject(audit);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofPackageCover(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const covers = measureProofSheetObjects().filter((object) => (object as MeasureProofCoverObject).measureProofCoverKind === 'measure-proof-package-cover');
  if (covers.length > 0) {
    for (const cover of covers) setProofCoverVisuals(cover);
    canvas.requestRenderAll();
    pushHistory();
    return covers.length;
  }
  const cover = proofCoverObject(bounds);
  canvas.add(cover);
  canvas.setActiveObject(cover);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofDeliveryChecklist(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const deliveries = measureProofSheetObjects().filter((object) => (object as MeasureProofDeliveryObject).measureProofDeliveryKind === 'measure-proof-delivery-checklist');
  if (deliveries.length > 0) {
    for (const delivery of deliveries) setProofDeliveryVisuals(delivery);
    canvas.requestRenderAll();
    pushHistory();
    return deliveries.length;
  }
  const delivery = proofDeliveryObject(bounds);
  canvas.add(delivery);
  canvas.setActiveObject(delivery);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofReleaseStamp(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const releases = measureProofSheetObjects().filter((object) => (object as MeasureProofReleaseObject).measureProofReleaseKind === 'measure-proof-release-stamp');
  if (releases.length > 0) {
    for (const release of releases) setProofReleaseVisuals(release);
    canvas.requestRenderAll();
    pushHistory();
    return releases.length;
  }
  const release = proofReleaseObject(bounds);
  canvas.add(release);
  canvas.setActiveObject(release);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofPackageIndex(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const indexes = measureProofSheetObjects().filter((object) => (object as MeasureProofIndexObject).measureProofIndexKind === 'measure-proof-package-index');
  if (indexes.length > 0) {
    for (const index of indexes) setProofIndexVisuals(index);
    canvas.requestRenderAll();
    pushHistory();
    return indexes.length;
  }
  const index = proofIndexObject(bounds);
  canvas.add(index);
  canvas.setActiveObject(index);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function addMeasureProofDeliveryContact(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const contacts = measureProofSheetObjects().filter((object) => (object as MeasureProofContactObject).measureProofContactKind === 'measure-proof-delivery-contact');
  if (contacts.length > 0) {
    for (const contact of contacts) setProofContactVisuals(contact, (contact as MeasureProofContactObject).measureProofContact ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return contacts.length;
  }
  const contact = proofContactObject(bounds);
  canvas.add(contact);
  canvas.setActiveObject(contact);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofDeliveryContact(contact: MeasureProofContact): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofContactObject).measureProofContactKind === 'measure-proof-delivery-contact');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofContactVisuals(panel, contact);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofDeliverySchedule(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const schedules = measureProofSheetObjects().filter((object) => (object as MeasureProofScheduleObject).measureProofScheduleKind === 'measure-proof-delivery-schedule');
  if (schedules.length > 0) {
    for (const schedule of schedules) setProofScheduleVisuals(schedule, (schedule as MeasureProofScheduleObject).measureProofSchedule ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return schedules.length;
  }
  const schedule = proofScheduleObject(bounds);
  canvas.add(schedule);
  canvas.setActiveObject(schedule);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofDeliverySchedule(schedule: MeasureProofSchedule): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofScheduleObject).measureProofScheduleKind === 'measure-proof-delivery-schedule');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofScheduleVisuals(panel, schedule);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofDeliveryRoute(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const routes = measureProofSheetObjects().filter((object) => (object as MeasureProofRouteObject).measureProofRouteKind === 'measure-proof-delivery-route');
  if (routes.length > 0) {
    for (const route of routes) setProofRouteVisuals(route, (route as MeasureProofRouteObject).measureProofRoute ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return routes.length;
  }
  const route = proofRouteObject(bounds);
  canvas.add(route);
  canvas.setActiveObject(route);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofDeliveryRoute(route: MeasureProofRoute): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofRouteObject).measureProofRouteKind === 'measure-proof-delivery-route');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofRouteVisuals(panel, route);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofFulfillmentHandoff(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const handoffs = measureProofSheetObjects().filter((object) => (object as MeasureProofFulfillmentObject).measureProofFulfillmentKind === 'measure-proof-fulfillment-handoff');
  if (handoffs.length > 0) {
    for (const handoff of handoffs) setProofFulfillmentVisuals(handoff, (handoff as MeasureProofFulfillmentObject).measureProofFulfillment ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return handoffs.length;
  }
  const handoff = proofFulfillmentObject(bounds);
  canvas.add(handoff);
  canvas.setActiveObject(handoff);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofFulfillmentHandoff(fulfillment: MeasureProofFulfillment): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofFulfillmentObject).measureProofFulfillmentKind === 'measure-proof-fulfillment-handoff');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofFulfillmentVisuals(panel, fulfillment);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofInstallHandoff(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const handoffs = measureProofSheetObjects().filter((object) => (object as MeasureProofInstallObject).measureProofInstallKind === 'measure-proof-install-handoff');
  if (handoffs.length > 0) {
    for (const handoff of handoffs) setProofInstallVisuals(handoff, (handoff as MeasureProofInstallObject).measureProofInstall ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return handoffs.length;
  }
  const handoff = proofInstallObject(bounds);
  canvas.add(handoff);
  canvas.setActiveObject(handoff);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofInstallHandoff(install: MeasureProofInstall): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofInstallObject).measureProofInstallKind === 'measure-proof-install-handoff');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofInstallVisuals(panel, install);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofSiteReadiness(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofSiteReadinessObject).measureProofSiteReadinessKind === 'measure-proof-site-readiness');
  if (panels.length > 0) {
    for (const panel of panels) setProofSiteReadinessVisuals(panel, (panel as MeasureProofSiteReadinessObject).measureProofSiteReadiness ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofSiteReadinessObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofSiteReadiness(readiness: MeasureProofSiteReadiness): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofSiteReadinessObject).measureProofSiteReadinessKind === 'measure-proof-site-readiness');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofSiteReadinessVisuals(panel, readiness);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofInstallPunchList(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofPunchListObject).measureProofPunchListKind === 'measure-proof-install-punch-list');
  if (panels.length > 0) {
    for (const panel of panels) setProofPunchListVisuals(panel, (panel as MeasureProofPunchListObject).measureProofPunchList ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofPunchListObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofInstallPunchList(punchList: MeasureProofPunchList): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofPunchListObject).measureProofPunchListKind === 'measure-proof-install-punch-list');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofPunchListVisuals(panel, punchList);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofClientAcceptance(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofAcceptanceObject).measureProofAcceptanceKind === 'measure-proof-client-acceptance');
  if (panels.length > 0) {
    for (const panel of panels) setProofAcceptanceVisuals(panel, (panel as MeasureProofAcceptanceObject).measureProofAcceptance ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofAcceptanceObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofClientAcceptance(acceptance: MeasureProofAcceptance): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofAcceptanceObject).measureProofAcceptanceKind === 'measure-proof-client-acceptance');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofAcceptanceVisuals(panel, acceptance);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofWarrantyInfo(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofWarrantyObject).measureProofWarrantyKind === 'measure-proof-warranty-info');
  if (panels.length > 0) {
    for (const panel of panels) setProofWarrantyVisuals(panel, (panel as MeasureProofWarrantyObject).measureProofWarranty ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofWarrantyObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofWarrantyInfo(warranty: MeasureProofWarranty): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofWarrantyObject).measureProofWarrantyKind === 'measure-proof-warranty-info');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofWarrantyVisuals(panel, warranty);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofCareInstructions(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofCareObject).measureProofCareKind === 'measure-proof-care-instructions');
  if (panels.length > 0) {
    for (const panel of panels) setProofCareVisuals(panel, (panel as MeasureProofCareObject).measureProofCare ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofCareObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofCareInstructions(care: MeasureProofCare): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofCareObject).measureProofCareKind === 'measure-proof-care-instructions');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofCareVisuals(panel, care);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofAssetArchive(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofArchiveObject).measureProofArchiveKind === 'measure-proof-asset-archive');
  if (panels.length > 0) {
    for (const panel of panels) setProofArchiveVisuals(panel, (panel as MeasureProofArchiveObject).measureProofArchive ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofArchiveObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofAssetArchive(archive: MeasureProofArchive): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofArchiveObject).measureProofArchiveKind === 'measure-proof-asset-archive');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofArchiveVisuals(panel, archive);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function addMeasureProofFileVerification(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = measureProofManifestBounds();
  if (!bounds) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofVerificationObject).measureProofVerificationKind === 'measure-proof-file-verification');
  if (panels.length > 0) {
    for (const panel of panels) setProofVerificationVisuals(panel, (panel as MeasureProofVerificationObject).measureProofVerification ?? {});
    canvas.requestRenderAll();
    pushHistory();
    return panels.length;
  }
  const panel = proofVerificationObject(bounds);
  canvas.add(panel);
  canvas.setActiveObject(panel);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function setMeasureProofFileVerification(verification: MeasureProofVerification): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofVerificationObject).measureProofVerificationKind === 'measure-proof-file-verification');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofVerificationVisuals(panel, verification);
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function setMeasureProofSignoff(signoff: MeasureProofSignoff): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const checklists = measureProofSheetObjects().filter((object) => (object as MeasureProofChecklistObject).measureProofChecklistKind === 'measure-proof-checklist');
  if (checklists.length === 0) return 0;
  for (const checklist of checklists) setProofChecklistSignoffVisuals(checklist, signoff);
  refreshMeasureProofManifests();
  canvas.requestRenderAll();
  pushHistory();
  return checklists.length;
}

export function setMeasureProofJobInfo(info: MeasureProofJobInfo): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const panels = measureProofSheetObjects().filter((object) => (object as MeasureProofJobInfoObject).measureProofJobInfoKind === 'measure-proof-job-info');
  if (panels.length === 0) return 0;
  for (const panel of panels) setProofJobInfoVisuals(panel, info);
  refreshMeasureProofFilenames();
  refreshMeasureProofManifests();
  canvas.requestRenderAll();
  pushHistory();
  return panels.length;
}

export function setMeasureProofApprovalStatus(status: MeasureProofApprovalStatus): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const stamps = measureProofSheetObjects().filter((object) => (object as MeasureProofApprovalObject).measureProofApprovalKind === 'measure-proof-approval-stamp');
  if (stamps.length === 0) return 0;
  for (const stamp of stamps) setProofApprovalVisuals(stamp, status);
  const checklists = measureProofSheetObjects().filter((object) => (object as MeasureProofChecklistObject).measureProofChecklistKind === 'measure-proof-checklist');
  for (const checklist of checklists) setProofChecklistStateVisuals(checklist, status);
  refreshMeasureProofFilenames();
  refreshMeasureProofManifests();
  canvas.requestRenderAll();
  pushHistory();
  return stamps.length;
}

export function clearMeasureProofSheetObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = measureProofSheetObjects();
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of matches) canvas.remove(object);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function lockMeasureAnnotations(): number {
  return setMeasureAnnotationsLocked(true);
}

export function unlockMeasureAnnotations(): number {
  return setMeasureAnnotationsLocked(false);
}

export function hideMeasureAnnotations(): number {
  return setMeasureAnnotationsVisible(false);
}

export function showMeasureAnnotations(): number {
  return setMeasureAnnotationsVisible(true);
}

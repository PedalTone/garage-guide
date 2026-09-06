'use client';

export const dynamic = 'force-static';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { clearGarage, getImageUrl, loadSnapshot, replaceAll, saveDocument, saveMaintenance, saveResourceLink, saveVehicle } from '@/lib/db';
import { sampleGarage } from '@/lib/demo';
import { chooseBackupFolder, getBackupFolderStatus, syncBackupFolder, type BackupFolderStatus } from '@/lib/folder-backup';
import { prepareDocumentImages } from '@/lib/image';
import { categoryLabels, type AppSnapshot, type DocumentCategory, type DocumentRecord, type ResourceLinkRecord, type Vehicle } from '@/lib/models';
import {
  Bell, CalendarDays, Camera, CarFront, Check, ChevronRight,
  Copy, Download, ExternalLink, FileText, Gauge, HardDrive, Info,
  Pencil, Plus, Printer, ReceiptText, ScanLine, Search, Settings, ShieldCheck, Upload, Wrench, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type View = 'today' | 'vehicles' | 'records' | 'settings';
type AddMode = 'menu' | 'vehicle' | 'document' | 'maintenance';
type ToastState = { message: string; key: number } | null;
type FormSubmitEvent = { preventDefault(): void; currentTarget: HTMLFormElement };
type RestoreCandidate = { snapshot: AppSnapshot; exportedAt?: string; fileName: string };

const emptySnapshot: AppSnapshot = { vehicles: [], documents: [], maintenanceRecords: [], resourceLinks: [] };
const APP_VERSION = '1.3';
const resourceLinks = [
  { label: 'Virginia DMV registration', organization: 'Virginia DMV', url: 'https://www.dmv.virginia.gov/vehicles/registration' },
  { label: 'Virginia emissions information', organization: 'Virginia DEQ', url: 'https://www.deq.virginia.gov/air-energy/vehicle-emissions-air-check' },
  { label: 'Check vehicle recalls', organization: 'NHTSA', url: 'https://www.nhtsa.gov/recalls' },
];

function pastedImageFile(clipboardData: DataTransfer) {
  const image = Array.from(clipboardData.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
  return image ? new File([image], `pasted-screenshot-${Date.now()}.png`, { type: image.type || 'image/png' }) : null;
}

function usePhotoPaste(setFile: (file: File | null) => void, file: File | null) {
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (!document.querySelector('.photo-input')) return;
      if (event.target instanceof Element && event.target.closest('textarea, select, input:not([type="file"])')) return;
      const image = event.clipboardData ? pastedImageFile(event.clipboardData) : null;
      if (image) { event.preventDefault(); setFile(image); }
    };
    document.addEventListener('paste', paste);
    const picker = document.querySelector('.photo-input input[type="file"]');
    const photoLabel = picker?.parentElement;
    if (picker && photoLabel && !photoLabel.parentElement?.querySelector('.paste-screenshot-button')) {
      picker.removeAttribute('capture');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'paste-screenshot-button';
      button.textContent = 'Paste screenshot';
      button.setAttribute('aria-label', 'Paste screenshot from clipboard');
      const message = document.createElement('p');
      message.className = 'paste-screenshot-message';
      message.setAttribute('role', 'status');
      button.addEventListener('click', () => {
        void readClipboardImage().then((image) => { setFile(image); }).catch(() => {
          message.textContent = 'Could not paste a screenshot. Choose it from Photos or Files instead.';
        });
      });
      photoLabel.insertAdjacentElement('afterend', button);
      button.insertAdjacentElement('afterend', message);
    }
    return () => document.removeEventListener('paste', paste);
  }, [setFile, file]);
}

async function readClipboardImage() {
  if (!navigator.clipboard?.read) throw new Error('Clipboard image access is not available in this browser.');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (imageType) {
      const image = await item.getType(imageType);
      return new File([image], `pasted-screenshot-${Date.now()}.png`, { type: imageType });
    }
  }
  throw new Error('No screenshot was found on your clipboard.');
}


function niceDate(value?: string) {
  if (!value) return 'Date needed';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function deadlineState(date?: string) {
  if (!date) return { label: 'Date needed', tone: 'missing', days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T12:00:00`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: 'Overdue', tone: 'overdue', days };
  if (days <= 60) return { label: 'Due soon', tone: 'due', days };
  return { label: 'Current', tone: 'current', days };
}

function maskPolicy(value?: string | number) {
  const raw = String(value || '');
  return raw ? `•••• ${raw.slice(-4)}` : 'Not recorded';
}

function coverageMoney(value?: string | number) {
  const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return amount ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount) : '';
}

function insuranceCoverageItems(record?: DocumentRecord) {
  if (!record) return [];
  const fields = record.fields;
  const paired = (first: string | number | undefined, second: string | number | undefined) => [coverageMoney(first), coverageMoney(second)].filter(Boolean).join(' / ');
  return [
    { label: 'Bodily injury liability', value: paired(fields.bodilyInjuryPerPerson, fields.bodilyInjuryPerAccident), note: 'per person / per accident' },
    { label: 'Property damage liability', value: coverageMoney(fields.propertyDamage), note: 'per accident' },
    { label: 'Uninsured / underinsured', value: paired(fields.uninsuredPerPerson, fields.uninsuredPerAccident), note: 'per person / per accident' },
    { label: 'Medical payments / PIP', value: coverageMoney(fields.medicalPayments), note: 'policy limit' },
    { label: 'Collision deductible', value: coverageMoney(fields.collisionDeductible), note: 'your deductible' },
    { label: 'Comprehensive deductible', value: coverageMoney(fields.comprehensiveDeductible), note: 'your deductible' },
    { label: 'Rental reimbursement', value: String(fields.rentalCoverage || ''), note: 'daily / maximum' },
    { label: 'Roadside assistance', value: String(fields.roadsideCoverage || ''), note: 'policy feature' },
  ].filter((item) => item.value);
}

function createRecordsExport(snapshot: AppSnapshot, notify: (message: string) => void) {
  const payload = { format: 'garage-guide-records', schemaVersion: 2, exportedAt: new Date().toISOString(), appVersion: '0.1.0', imagePolicy: 'images-exported-separately', ...snapshot, odometerReadings: [], maintenanceTasks: [], reminderPreferences: [], settings: {} };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `garage-guide-records-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify('Records export created');
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [view, setView] = useState<View>('today');
  const [activeVehicleId, setActiveVehicleId] = useState('');
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [viewer, setViewer] = useState<DocumentRecord | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [printPreview, setPrintPreview] = useState(false);
  const [linkDialog, setLinkDialog] = useState(false);
  const [backupFolder, setBackupFolder] = useState<BackupFolderStatus | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null);
  const [vinVehicle, setVinVehicle] = useState<Vehicle | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingRecord, setEditingRecord] = useState<DocumentRecord | null>(null);

  const refresh = async () => {
    const next = await loadSnapshot();
    setSnapshot(next);
    if (!activeVehicleId && next.vehicles[0]) setActiveVehicleId(next.vehicles[0].id);
    return next;
  };

  const refreshAndSync = async () => {
    const next = await refresh();
    try { await syncBackupFolder(next); } catch { /* The status card will offer reconnection if access is lost. */ }
    setBackupFolder(await getBackupFolderStatus());
  };

  useEffect(() => {
    loadSnapshot()
      .then((next) => { setSnapshot(next); setActiveVehicleId(next.vehicles[0]?.id || ''); })
      .catch((error) => setStorageError(error instanceof Error ? error.message : 'Local storage could not be opened.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void getBackupFolderStatus().then(setBackupFolder); }, []);

  useEffect(() => () => { if (viewerImage) URL.revokeObjectURL(viewerImage); }, [viewerImage]);

  const notify = (message: string) => {
    setToast({ message, key: Date.now() });
    window.setTimeout(() => setToast(null), 2600);
  };

  const activeVehicle = snapshot.vehicles.find((vehicle) => vehicle.id === activeVehicleId) || snapshot.vehicles[0];
  const activeDocs = snapshot.documents.filter((record) => record.vehicleId === activeVehicle?.id);
  const activeMaintenance = snapshot.maintenanceRecords.filter((record) => record.vehicleId === activeVehicle?.id);

  const deadlines = useMemo(() => snapshot.documents
    .filter((record) => record.expirationDate)
    .sort((a, b) => String(a.expirationDate).localeCompare(String(b.expirationDate))), [snapshot.documents]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return snapshot.documents;
    return snapshot.documents.filter((record) => {
      const vehicle = snapshot.vehicles.find((item) => item.id === record.vehicleId);
      return [record.title, record.category, vehicle?.nickname, vehicle?.make, vehicle?.model, ...Object.values(record.fields)]
        .join(' ').toLowerCase().includes(query);
    });
  }, [search, snapshot]);

  const openViewer = async (record: DocumentRecord) => {
    setViewer(record);
    const url = await getImageUrl(record.primaryImageId);
    setViewerImage(url);
  };

  const loadDemo = async () => {
    await replaceAll(sampleGarage);
    await refreshAndSync();
    setActiveVehicleId(sampleGarage.vehicles[0].id);
    notify('Sample garage added');
  };

  const configureBackupFolder = async () => {
    try {
      const name = await chooseBackupFolder();
      await syncBackupFolder(snapshot);
      setBackupFolder(await getBackupFolderStatus());
      notify(`Backup folder set to ${name}`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      notify(caught instanceof Error ? caught.message : 'The backup folder could not be set.');
    }
  };

  const prepareRestore = async (file: File) => {
    try {
      if (file.size > 10_000_000) throw new Error('That backup is larger than the 10 MB restore limit.');
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== 'garage-guide-records') throw new Error('This is not a Garage Guide records backup.');
      if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.documents) || !Array.isArray(parsed.maintenanceRecords)) throw new Error('This backup is missing required record collections.');
      const snapshot: AppSnapshot = { vehicles: parsed.vehicles as Vehicle[], documents: parsed.documents as DocumentRecord[], maintenanceRecords: parsed.maintenanceRecords as AppSnapshot['maintenanceRecords'], resourceLinks: Array.isArray(parsed.resourceLinks) ? parsed.resourceLinks as ResourceLinkRecord[] : [] };
      if (snapshot.vehicles.some((item) => !item?.id || !item.make || !item.model) || snapshot.documents.some((item) => !item?.id || !item.vehicleId || !item.category)) throw new Error('Some records in this backup are incomplete or invalid.');
      setRestoreCandidate({ snapshot, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined, fileName: file.name });
    } catch (caught) { notify(caught instanceof Error ? caught.message : 'The backup could not be read.'); }
  };

  if (loading) return <main className="loading-screen"><span className="brand-mark"><CarFront /></span><p>Opening your garage…</p></main>;

  if (storageError) return (
    <main className="onboarding"><div className="onboarding-card"><span className="intro-icon warning"><HardDrive /></span><p className="eyebrow">Storage unavailable</p><h1>Garage Guide needs local storage</h1><p>{storageError} Try a normal browser window and make sure site storage is allowed before adding records.</p></div></main>
  );

  if (!snapshot.vehicles.length) return (
    <main className="onboarding">
      <section className="onboarding-card">
        <div className="intro-brand"><span className="brand-mark"><CarFront size={24} /></span><strong>Garage Guide <span className="app-version">(v{APP_VERSION})</span></strong></div>
        <p className="eyebrow">Let’s get your garage organized</p>
        <h1>We’ll take it one easy step at a time.</h1>
        <p className="intro-copy">Start with one vehicle. Then Garage Guide will show you exactly which documents and details to add next.</p>
        <div className="privacy-callout"><ShieldCheck size={21} /><p><strong>Stored on this device.</strong><br />Your records and photos stay in this browser. Clearing site data can erase them, so regular exports matter.</p></div>
        <div className="intro-actions">
          <Button className="primary-control" onClick={() => setAddMode('vehicle')}>Start my garage<ChevronRight /></Button>
          <Button className="sample-control" variant="outline" onClick={loadDemo}>Explore with sample data</Button>
        </div>
        <p className="intro-footnote">No account · No analytics · Works offline after first load</p>
      </section>
      <AddDialog mode={addMode} setMode={setAddMode} snapshot={snapshot} onSaved={async () => { await refreshAndSync(); setAddMode(null); notify('Vehicle saved'); }} />
      {toast && <output className="toast" key={toast.key}><Check size={18} />{toast.message}</output>}
    </main>
  );

  return (
    <main className="app-shell">
      <div className="trust-banner"><ShieldCheck />Your garage stays private on this device</div>
      <aside className="desktop-rail" aria-label="Primary navigation">
        <button className="brand brand-button" onClick={() => setView('today')} aria-label="Garage Guide home"><span className="brand-mark"><CarFront size={22} /></span><span>Garage Guide <span className="app-version">(v{APP_VERSION})</span></span></button>
        <NavLinks view={view} setView={setView} />
        <p className="privacy-note"><ShieldCheck size={17} />Private to this device</p>
      </aside>

      <section className="page" id="top">
        {view === 'today' && <TodayView snapshot={snapshot} activeVehicle={activeVehicle} activeVehicleId={activeVehicleId} setActiveVehicleId={setActiveVehicleId} deadlines={deadlines} openViewer={openViewer} setAddMode={setAddMode} onExport={() => createRecordsExport(snapshot, notify)} onPrint={() => setPrintPreview(true)} backupFolder={backupFolder} onOpenStorage={() => setView('settings')} />}
        {view === 'vehicles' && <VehiclesView snapshot={snapshot} activeVehicle={activeVehicle} setActiveVehicleId={setActiveVehicleId} activeDocs={activeDocs} maintenance={activeMaintenance} openViewer={openViewer} setAddMode={setAddMode} notify={notify} onAddLink={() => setLinkDialog(true)} onVinLookup={() => setVinVehicle(activeVehicle || null)} onEditVehicle={() => setEditingVehicle(activeVehicle || null)} />}
        {view === 'records' && <RecordsView records={visibleRecords} vehicles={snapshot.vehicles} search={search} setSearch={setSearch} openViewer={openViewer} setAddMode={setAddMode} />}
        {view === 'settings' && <SettingsView snapshot={snapshot} notify={notify} onPrint={() => setPrintPreview(true)} onImport={prepareRestore} backupFolder={backupFolder} onChooseFolder={configureBackupFolder} onReset={async () => { await clearGarage(); setSnapshot(emptySnapshot); setActiveVehicleId(''); setView('today'); }} />}
      </section>

      <BottomNav view={view} setView={setView} onAdd={() => setAddMode('menu')} />
      <AddDialog mode={addMode} setMode={setAddMode} snapshot={snapshot} onSaved={async () => { await refreshAndSync(); setAddMode(null); notify('Saved to your garage'); }} />
      <DocumentViewer record={viewer} vehicle={snapshot.vehicles.find((item) => item.id === viewer?.vehicleId)} imageUrl={viewerImage} onClose={() => { setViewer(null); setViewerImage(null); }} onEdit={() => { if (viewer) { setEditingRecord(viewer); setViewer(null); setViewerImage(null); } }} notify={notify} />
      <PrintPreview open={printPreview} snapshot={snapshot} onClose={() => setPrintPreview(false)} />
      {linkDialog && <LinkDialog onClose={() => setLinkDialog(false)} onSaved={async () => { await refreshAndSync(); setLinkDialog(false); notify('Website saved'); }} />}
      {editingVehicle && <EditVehicleDialog vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} onSaved={async () => { await refreshAndSync(); setEditingVehicle(null); notify('Vehicle details updated'); }} />}
      {editingRecord && <EditDocumentDialog record={editingRecord} vehicles={snapshot.vehicles} onClose={() => setEditingRecord(null)} onSaved={async () => { await refreshAndSync(); setEditingRecord(null); notify('Record updated'); }} />}
      <RestoreBackupDialog candidate={restoreCandidate} onClose={() => setRestoreCandidate(null)} onRestore={async () => { if (!restoreCandidate) return; await replaceAll(restoreCandidate.snapshot); await refreshAndSync(); setActiveVehicleId(restoreCandidate.snapshot.vehicles[0]?.id || ''); setRestoreCandidate(null); setView('today'); notify('Backup restored'); }} />
      {vinVehicle && <VinLookupDialog vehicle={vinVehicle} onClose={() => setVinVehicle(null)} onSaved={async () => { await refreshAndSync(); setVinVehicle(null); notify('VIN details and recall check saved'); }} />}
      {toast && <output className="toast" key={toast.key}><Check size={18} />{toast.message}</output>}
      <GloveBoxReport snapshot={snapshot} />
    </main>
  );
}

function NavLinks({ view, setView }: { view: View; setView: (view: View) => void }) {
  const items: { id: View; label: string; icon: typeof Bell }[] = [
    { id: 'today', label: 'Today', icon: Bell }, { id: 'vehicles', label: 'Vehicles', icon: CarFront },
    { id: 'records', label: 'Records', icon: FileText }, { id: 'settings', label: 'Settings', icon: Settings },
  ];
  return <nav className="rail-nav">{items.map(({ id, label, icon: Icon }) => <button key={id} className={`rail-link ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={19} />{label}</button>)}</nav>;
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{action}</header>;
}

function TodayView({ snapshot, activeVehicle, activeVehicleId, setActiveVehicleId, deadlines, openViewer, setAddMode, onExport, onPrint, backupFolder, onOpenStorage }: {
  snapshot: AppSnapshot; activeVehicle?: Vehicle; activeVehicleId: string; setActiveVehicleId: (id: string) => void;
  deadlines: DocumentRecord[]; openViewer: (record: DocumentRecord) => void; setAddMode: (mode: AddMode) => void; onExport: () => void; onPrint: () => void; backupFolder: BackupFolderStatus | null; onOpenStorage: () => void;
}) {
  const urgent = deadlines.find((record) => ['overdue', 'due'].includes(deadlineState(record.expirationDate).tone));
  const urgentVehicle = snapshot.vehicles.find((vehicle) => vehicle.id === urgent?.vehicleId);
  const total = snapshot.maintenanceRecords.reduce((sum, record) => sum + record.totalCents, 0);
  const vehicleDocs = snapshot.documents.filter((record) => record.vehicleId === activeVehicle?.id);
  const setupItems = [
    { label: 'Vehicle details', done: Boolean(activeVehicle?.year && activeVehicle.make && activeVehicle.model), action: () => setAddMode('vehicle') },
    { label: 'Insurance', done: vehicleDocs.some((record) => record.category === 'insurance'), action: () => setAddMode('document') },
    { label: 'Registration', done: vehicleDocs.some((record) => record.category === 'registration'), action: () => setAddMode('document') },
    { label: 'Inspection or emissions', done: vehicleDocs.some((record) => record.category === 'inspection' || record.category === 'emissions'), action: () => setAddMode('document') },
    { label: 'Backup plan', done: Boolean(backupFolder?.configured && backupFolder.permission === 'granted'), action: onOpenStorage },
  ];
  const completedSetup = setupItems.filter((item) => item.done).length;
  const nextSetup = setupItems.find((item) => !item.done);
  return <>
    <PageHeader eyebrow={`Garage Guide (v${APP_VERSION}) · ${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}`} title="Today" action={<button className="scan-button" onClick={() => setAddMode('document')}><ScanLine size={20} />Scan document</button>} />
    <VehicleSwitcher vehicles={snapshot.vehicles} activeId={activeVehicleId} setActiveId={setActiveVehicleId} onAdd={() => setAddMode('vehicle')} />
    {completedSetup < setupItems.length && <section className="guided-checkup">
      <div className="checkup-topline"><span>Garage checkup</span><strong>{completedSetup} of {setupItems.length} complete</strong></div>
      <progress className="checkup-progress" aria-label="Garage setup progress" max={setupItems.length} value={completedSetup}>{completedSetup} of {setupItems.length}</progress>
      <div className="checkup-body"><div><p className="eyebrow">Your next best step</p><h2>{nextSetup?.label}</h2><p>We’ll ask only for what helps keep this vehicle ready and its records useful.</p></div><button onClick={nextSetup?.action}>Continue<ChevronRight /></button></div>
      <div className="checkup-steps" aria-label="Setup checklist">{setupItems.map((item) => <span className={item.done ? 'done' : ''} key={item.label}>{item.done ? <Check /> : <i />}{item.label}</span>)}</div>
    </section>}
    {backupFolder && (!backupFolder.configured || backupFolder.permission !== 'granted') && <section className="storage-alert"><span><HardDrive /></span><div><p className="eyebrow">Backup location needed</p><h3>{backupFolder.supported ? backupFolder.configured ? 'Reconnect your backup folder' : 'Choose where your backup copy lives' : 'Back up this iPhone regularly'}</h3><p>{backupFolder.supported ? 'Your working data is currently stored only in this browser and is not mirrored to a folder. You can choose any computer folder, including one inside Dropbox or iCloud Drive.' : 'Your working data is stored in this iPhone browser. iPhone browsers cannot continuously write to a chosen folder, so export backups to Files, iCloud Drive, or Dropbox.'}</p></div><button onClick={onOpenStorage}>{backupFolder.supported ? 'Set folder' : 'View backup options'}<ChevronRight /></button></section>}
    <section className={`hero-card ${urgent ? '' : 'all-clear'}`}>
      {urgent ? <>
        <div><span className="status-kicker"><span className="status-dot" />One item needs attention</span><h2>{categoryLabels[urgent.category]} {deadlineState(urgent.expirationDate).days! < 0 ? 'is overdue' : `renews in ${deadlineState(urgent.expirationDate).days} days`}</h2><p>{urgentVehicle?.year} {urgentVehicle?.make} {urgentVehicle?.model} · {String(urgent.fields.carrier || urgent.title)}</p></div>
        <div className="hero-actions"><button className="primary-action" onClick={() => openViewer(urgent)}>View {urgent.category === 'insurance' ? 'insurance card' : 'document'}</button><button className="quiet-action" onClick={() => setAddMode('document')}>Add updated document</button></div>
      </> : <><div><span className="status-kicker"><Check size={17} />No urgent deadlines</span><h2>Your garage looks current.</h2><p>Add a document or update your mileage to keep it that way.</p></div><div className="hero-actions"><button className="primary-action" onClick={() => setAddMode('document')}>Add a document</button></div></>}
    </section>
    <div className="metric-strip"><div><small>Vehicles</small><strong>{snapshot.vehicles.length}</strong></div><div><small>Documents</small><strong>{snapshot.documents.length}</strong></div><div><small>Recorded service</small><strong>{money(total)}</strong></div></div>
    <div className="content-grid">
      <section><div className="section-heading"><div><p className="eyebrow">Across your garage</p><h2>Coming up</h2></div><span className="subtle-label">This year</span></div>
        {deadlines.length ? <div className="stack">{deadlines.slice(0, 5).map((record) => <DeadlineCard key={record.id} record={record} vehicle={snapshot.vehicles.find((item) => item.id === record.vehicleId)} onClick={() => openViewer(record)} />)}</div> : <EmptyCard icon={CalendarDays} title="No deadlines yet" copy="Add registration, insurance, or inspection dates to see what is coming." action="Add document" onAction={() => setAddMode('document')} />}
      </section>
      <aside className="side-stack">
        <section className="utility-card"><span className="utility-icon"><Gauge size={20} /></span><div><p className="eyebrow">Current mileage</p><h3>{activeVehicle?.currentOdometer?.toLocaleString() || 'Mileage needed'} miles</h3><p>{activeVehicle?.nickname}</p></div><button className="icon-button" onClick={() => setAddMode('vehicle')} aria-label="Update mileage"><ChevronRight /></button></section>
        <section className="backup-card"><div><p className="eyebrow">Backup & glove box</p><h3>Keep a digital copy and a paper summary</h3><p>The printable summary shortens sensitive identifiers and is designed for your glove compartment.</p></div><div className="backup-actions"><button className="secondary-action" onClick={onExport}><Download />Export data</button><button className="secondary-action" onClick={onPrint}><Printer />Print summary</button></div></section>
      </aside>
    </div>
    <p className="legal-note">Garage Guide organizes information you provide. Confirm dates and requirements with your DMV, insurer, or vehicle manufacturer.</p>
  </>;
}

function VehicleSwitcher({ vehicles, activeId, setActiveId, onAdd }: { vehicles: Vehicle[]; activeId: string; setActiveId: (id: string) => void; onAdd: () => void }) {
  return <section className="vehicle-switcher" aria-label="Choose a vehicle">{vehicles.map((vehicle) => <button key={vehicle.id} className={`vehicle-pill ${activeId === vehicle.id ? 'selected' : ''}`} onClick={() => setActiveId(vehicle.id)} aria-pressed={activeId === vehicle.id}><span className="vehicle-dot"><CarFront size={18} /></span><span><strong>{vehicle.nickname}</strong><small>{vehicle.year} {vehicle.make}</small></span></button>)}<button className="vehicle-pill add-vehicle" onClick={onAdd}><Plus size={19} />Add vehicle</button></section>;
}

function DeadlineCard({ record, vehicle, onClick }: { record: DocumentRecord; vehicle?: Vehicle; onClick: () => void }) {
  const status = deadlineState(record.expirationDate);
  const date = record.expirationDate ? new Date(`${record.expirationDate}T12:00:00`) : null;
  return <button className="timeline-card" onClick={onClick}><span className="date-tile"><strong>{date ? date.getDate() : '—'}</strong><small>{date ? date.toLocaleString('en-US', { month: 'short' }).toUpperCase() : 'DATE'}</small></span><span className="timeline-copy"><strong>{categoryLabels[record.category]}</strong><small>{vehicle?.nickname} · {record.title}</small></span><span className={`status-badge ${status.tone}`}>{status.label}</span><ChevronRight size={19} /></button>;
}

function VehiclesView({ snapshot, activeVehicle, setActiveVehicleId, activeDocs, maintenance, openViewer, setAddMode, notify, onAddLink, onVinLookup, onEditVehicle }: {
  snapshot: AppSnapshot; activeVehicle?: Vehicle; setActiveVehicleId: (id: string) => void; activeDocs: DocumentRecord[]; maintenance: AppSnapshot['maintenanceRecords']; openViewer: (record: DocumentRecord) => void; setAddMode: (mode: AddMode) => void; notify: (message: string) => void; onAddLink: () => void; onVinLookup: () => void; onEditVehicle: () => void;
}) {
  if (!activeVehicle) return null;
  const insurance = activeDocs.filter((record) => record.category === 'insurance').sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0];
  const registration = activeDocs.find((record) => record.category === 'registration');
  const copy = async (value: string, label: string) => { await navigator.clipboard.writeText(value); notify(`${label} copied`); };
  const serviceTotal = maintenance.reduce((sum, record) => sum + record.totalCents, 0);
  return <>
    <PageHeader eyebrow="Your garage" title="Vehicles" action={<button className="scan-button" onClick={() => setAddMode('vehicle')}><Plus />Add vehicle</button>} />
    <VehicleSwitcher vehicles={snapshot.vehicles} activeId={activeVehicle.id} setActiveId={setActiveVehicleId} onAdd={() => setAddMode('vehicle')} />
    <section className="vehicle-identity"><div className="vehicle-hero-icon"><CarFront /></div><div><p className="eyebrow">{activeVehicle.nickname}</p><h2>{activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</h2><p>{activeVehicle.trim || 'Trim not recorded'} · {activeVehicle.currentOdometer?.toLocaleString() || 'Mileage needed'} miles</p></div><button className="vin-identity-button" onClick={onVinLookup} disabled={!activeVehicle.vin}><ShieldCheck />{activeVehicle.vinLookup ? 'Review VIN check' : 'Check VIN'}</button></section>
    <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">At a glance</p><h2>Quick facts</h2></div><div className="quick-fact-actions"><button className="text-button" onClick={onEditVehicle}>Edit vehicle<Pencil /></button>{activeVehicle.vin && <button className="text-button" onClick={onVinLookup}>{activeVehicle.vinLookup ? 'Checked with NHTSA' : 'Check VIN & recalls'}<ChevronRight /></button>}</div></div><div className="facts-grid">
      <Fact label="VIN" value={activeVehicle.vin || 'Not recorded'} action={activeVehicle.vin ? () => copy(activeVehicle.vin!, 'VIN') : undefined} />
      <Fact label="License plate" value={activeVehicle.licensePlate || 'Not recorded'} action={activeVehicle.licensePlate ? () => copy(activeVehicle.licensePlate!, 'Plate') : undefined} />
      <Fact label="Registration" value={registration ? niceDate(registration.expirationDate) : 'Not added'} />
      <Fact label="Insurance" value={insurance ? niceDate(insurance.expirationDate) : 'Not added'} />
    </div></section>
    {insurance && <><button className="insurance-wallet" onClick={() => openViewer(insurance)}><span className="insurance-icon"><ShieldCheck /></span><span><small>Current insurance card</small><strong>{String(insurance.fields.carrier || insurance.title)}</strong><em>{maskPolicy(insurance.fields.policyNumber)}</em></span><span className={`status-badge ${deadlineState(insurance.expirationDate).tone}`}>{deadlineState(insurance.expirationDate).label}</span><ChevronRight /></button><InsuranceCoverage record={insurance} /></>}
    <div className="vehicle-columns">
      <section><div className="section-heading"><div><p className="eyebrow">Document wallet</p><h2>Important documents</h2></div><button className="text-button" onClick={() => setAddMode('document')}>{insurance ? <><Plus />Add record</> : <><Camera />Add insurance card</>}</button></div>
        {activeDocs.length ? <div className="record-grid">{activeDocs.map((record) => <RecordCard key={record.id} record={record} onClick={() => openViewer(record)} />)}</div> : <EmptyCard icon={FileText} title="No documents yet" copy="Add your insurance, registration, or inspection record." action="Add document" onAction={() => setAddMode('document')} />}
      </section>
      <aside><div className="section-heading"><div><p className="eyebrow">Maintenance</p><h2>Last done</h2></div></div>
        <div className="stack">{['Oil & filter', 'Brake pads'].map((category) => { const item = maintenance.filter((record) => record.categories.includes(category)).sort((a,b) => b.serviceDate.localeCompare(a.serviceDate))[0]; return <section className="service-card" key={category}><span className="utility-icon"><Wrench /></span><div><h3>{category}</h3><p>{item ? `${niceDate(item.serviceDate)}${item.odometer ? ` · ${item.odometer.toLocaleString()} mi` : ''}` : `No ${category.toLowerCase()} recorded`}</p></div></section>; })}</div>
        <section className="cost-card"><small>Recorded maintenance & repairs</small><strong>{money(serviceTotal)}</strong><p>Based only on records saved here.</p></section>
      </aside>
    </div>
    <section className="resource-section"><div className="section-heading"><div><p className="eyebrow">Helpful websites</p><h2>Official links</h2></div><button className="text-button" onClick={onAddLink}><Plus />Add link</button></div><div className="resource-grid">{resourceLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer"><span><small>Official · {new URL(link.url).hostname}</small><strong>{link.label}</strong></span><ExternalLink /></a>)}{snapshot.resourceLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer"><span><small>Saved · {link.organization || new URL(link.url).hostname}</small><strong>{link.title}</strong>{link.description && <em>{link.description}</em>}</span><ExternalLink /></a>)}</div></section>
  </>;
}

function Fact({ label, value, action }: { label: string; value: string; action?: () => void }) {
  return <div className="fact"><small>{label}</small><strong>{value}</strong>{action && <button onClick={action} aria-label={`Copy ${label}`}><Copy /></button>}</div>;
}

function InsuranceCoverage({ record }: { record: DocumentRecord }) {
  const items = insuranceCoverageItems(record);
  return <section className="coverage-panel"><div className="coverage-heading"><div><p className="eyebrow">Policy protection</p><h2>Coverage at a glance</h2></div><span>Confirm against your declarations page</span></div>{items.length ? <div className="coverage-grid">{items.map((item) => <div className="coverage-item" key={item.label}><small>{item.label}</small><strong>{item.value}</strong><span>{item.note}</span></div>)}</div> : <p className="coverage-empty">Coverage limits have not been recorded for this policy yet. Add them with your next insurance document.</p>}</section>;
}

function RecordsView({ records, vehicles, search, setSearch, openViewer, setAddMode }: { records: DocumentRecord[]; vehicles: Vehicle[]; search: string; setSearch: (value: string) => void; openViewer: (record: DocumentRecord) => void; setAddMode: (mode: AddMode) => void }) {
  return <><PageHeader eyebrow="Searchable and private" title="Records" action={<button className="scan-button" onClick={() => setAddMode('document')}><Plus />Add record</button>} /><label className="search-field"><Search /><span className="sr-only">Search records</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipts, documents, or vehicles" /></label><div className="records-header"><p>{records.length} {records.length === 1 ? 'record' : 'records'}</p><span>Newest first</span></div>{records.length ? <div className="record-grid wide">{[...records].sort((a,b) => b.issueDate.localeCompare(a.issueDate)).map((record) => <RecordCard key={record.id} record={record} vehicle={vehicles.find((item) => item.id === record.vehicleId)} onClick={() => openViewer(record)} />)}</div> : <EmptyCard icon={Search} title="No matching records" copy="Try another search or add a new document." action="Add document" onAction={() => setAddMode('document')} />}</>;
}

function RecordCard({ record, vehicle, onClick }: { record: DocumentRecord; vehicle?: Vehicle; onClick: () => void }) {
  const status = deadlineState(record.expirationDate);
  const Icon = record.category === 'maintenance' ? ReceiptText : record.category === 'insurance' ? ShieldCheck : FileText;
  return <button className="record-card" onClick={onClick}><span className="record-icon"><Icon /></span><span className="record-copy"><small>{vehicle?.nickname || categoryLabels[record.category]}</small><strong>{record.title}</strong><em>{record.expirationDate ? `Expires ${niceDate(record.expirationDate)}` : `Added ${niceDate(record.issueDate)}`}</em></span><span className={`status-badge ${status.tone}`}>{record.expirationDate ? status.label : 'Saved'}</span></button>;
}

function SettingsView({ snapshot, notify, onPrint, onImport, backupFolder, onChooseFolder, onReset }: { snapshot: AppSnapshot; notify: (message: string) => void; onPrint: () => void; onImport: (file: File) => Promise<void>; backupFolder: BackupFolderStatus | null; onChooseFolder: () => Promise<void>; onReset: () => Promise<void> }) {
  const [storage, setStorage] = useState('Checking…');
  useEffect(() => { void navigator.storage?.estimate().then(({ usage, quota }) => setStorage(`${((usage || 0) / 1048576).toFixed(1)} MB used${quota ? ` of ${(quota / 1073741824).toFixed(1)} GB available` : ''}`)); }, []);
  return <><PageHeader eyebrow="Your data, your control" title="Settings" /><div className="settings-grid"><section className="settings-card primary-settings"><span className="settings-icon"><Download /></span><div><p className="eyebrow">Backup</p><h2>Protect your garage</h2><p>Export a recovery file, restore an earlier backup, or make a clean paper summary for the glove compartment. Document photos require the separate folder mirror.</p><div className="settings-actions"><button className="primary-action dark" data-export onClick={() => createRecordsExport(snapshot, notify)}><Download />Export records JSON</button><label className="primary-action dark outline import-action"><Upload />Import backup JSON<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file); event.target.value = ''; }} /></label><button className="primary-action dark outline" onClick={onPrint}><Printer />Print glove-box summary</button></div></div></section><section className={`settings-card folder-settings ${backupFolder?.configured && backupFolder.permission === 'granted' ? 'folder-ready' : ''}`}><span className="settings-icon"><HardDrive /></span><div><p className="eyebrow">Automatic local mirror</p><h3>{!backupFolder ? 'Checking folder access…' : backupFolder.configured && backupFolder.permission === 'granted' ? backupFolder.name : backupFolder.supported ? 'No backup folder selected' : 'Manual exports required on this device'}</h3><p>{backupFolder?.supported ? backupFolder.configured && backupFolder.permission === 'granted' ? 'Garage Guide updates the records file and document-image folder after each saved change.' : 'Choose any folder on this computer, including one inside Dropbox or iCloud Drive.' : 'This browser cannot continuously write to a folder. Use Export records JSON and save it to Files, iCloud Drive, or Dropbox.'}</p>{backupFolder?.supported && <button className="folder-button" onClick={() => void onChooseFolder()}>{backupFolder.configured ? 'Choose or reconnect folder' : 'Choose backup folder'}</button>}</div></section><section className="settings-card"><span className="settings-icon"><HardDrive /></span><div><p className="eyebrow">Browser storage</p><h3>{storage}</h3><p>Your working copy is stored in this browser on this device.</p></div></section><section className="settings-card"><span className="settings-icon"><ShieldCheck /></span><div><p className="eyebrow">Privacy</p><h3>No account or analytics</h3><p>Documents are processed and stored locally. Adding a website sends only its address to retrieve public page details.</p></div></section><section className="settings-card about-settings"><span className="settings-icon"><Info /></span><div><p className="eyebrow">About your data</p><h3>Your browser holds the working copy</h3><p>Vehicle data and document images are stored using this browser’s private website storage on this computer or phone. That storage is tied to both the browser and the device. It is not shared with another browser, computer, phone, or future website address.</p><ul><li>Opening Garage Guide in a different browser or on another device starts with a separate, empty database.</li><li>Clearing website data, using private browsing, resetting the browser, or losing the device can remove the working copy.</li><li>Moving the app’s project files does not move the browser database.</li><li>A selected backup folder or exported file is an independent copy that you control.</li></ul><p className="about-callout"><strong>Back up separately.</strong> Choose a folder mirror when supported, or regularly export the records and save them to Files, iCloud Drive, Dropbox, or another protected location.</p></div></section><section className="settings-card danger-zone"><span className="settings-icon"><Info /></span><div><p className="eyebrow">Start over</p><h3>Erase this device’s garage</h3><p>This removes the browser copy and folder connection. Files already written to a chosen backup folder remain there.</p><button className="danger-button" onClick={() => { if (window.confirm('Permanently erase every local vehicle, record, and photo? Existing files in a chosen backup folder will remain.') ) void onReset(); }}>Erase all local data</button></div></section></div></>;
}

function RestoreBackupDialog({ candidate, onClose, onRestore }: { candidate: RestoreCandidate | null; onClose: () => void; onRestore: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!candidate) return null;
  const date = candidate.exportedAt ? new Date(candidate.exportedAt) : null;
  return <Dialog open onOpenChange={(next) => !next && onClose()}><DialogContent className="app-dialog restore-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>Restore this backup?</DialogTitle><DialogDescription>Review the contents before replacing the current browser database.</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><div className="restore-file"><Upload /><div><small>Selected backup</small><strong>{candidate.fileName}</strong><span>{date && !Number.isNaN(date.getTime()) ? `Created ${date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Backup date unavailable'}</span></div></div><div className="restore-counts"><div><strong>{candidate.snapshot.vehicles.length}</strong><span>Vehicles</span></div><div><strong>{candidate.snapshot.documents.length}</strong><span>Documents</span></div><div><strong>{candidate.snapshot.maintenanceRecords.length}</strong><span>Maintenance</span></div><div><strong>{candidate.snapshot.resourceLinks.length}</strong><span>Saved links</span></div></div><div className="restore-warning"><Info /><p><strong>This replaces the current working records.</strong> JSON backups do not contain document-image files. Existing browser images will be removed; images must be recovered separately from a folder mirror.</p></div><div className="restore-actions"><button onClick={onClose}>Cancel</button><button className="restore-button" disabled={busy} onClick={async () => { setBusy(true); await onRestore(); }}>{busy ? 'Restoring…' : 'Restore and replace current data'}</button></div></DialogContent></Dialog>;
}

function PrintPreview({ open, snapshot, onClose }: { open: boolean; snapshot: AppSnapshot; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent className="print-preview-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>Glove-box summary</DialogTitle><DialogDescription>One privacy-conscious page per vehicle. Your full document photos are not included.</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><div className="print-preview-toolbar"><p><ShieldCheck />VIN and policy numbers are shortened.</p><button onClick={() => window.print()}><Printer />Print or save PDF</button></div><div className="print-preview-pages"><GloveBoxReport snapshot={snapshot} preview /></div></DialogContent></Dialog>;
}

function GloveBoxReport({ snapshot, preview = false }: { snapshot: AppSnapshot; preview?: boolean }) {
  const generated = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  return <article className={`print-report${preview ? ' preview-report' : ''}`} aria-hidden={!preview}>
    {snapshot.vehicles.map((vehicle) => {
      const documents = snapshot.documents.filter((record) => record.vehicleId === vehicle.id).sort((a, b) => String(a.expirationDate || a.issueDate).localeCompare(String(b.expirationDate || b.issueDate)));
      const maintenance = snapshot.maintenanceRecords.filter((record) => record.vehicleId === vehicle.id).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)).slice(0, 8);
      const insurance = snapshot.documents.filter((record) => record.vehicleId === vehicle.id && record.category === 'insurance').sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0];
      const coverage = insuranceCoverageItems(insurance);
      return <section className="print-vehicle" key={vehicle.id}>
        <header className="print-header"><div><p>GARAGE GUIDE · GLOVE-BOX SUMMARY</p><h1>{vehicle.nickname}</h1><h2>{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.trim ? ` · ${vehicle.trim}` : ''}</h2></div><div className="print-mark"><CarFront /></div></header>
        <div className="print-details"><div><small>License plate</small><strong>{vehicle.licensePlate || 'Not recorded'}</strong></div><div><small>VIN ending</small><strong>{vehicle.vin ? `••••••${vehicle.vin.slice(-6)}` : 'Not recorded'}</strong></div><div><small>Current mileage</small><strong>{vehicle.currentOdometer ? `${vehicle.currentOdometer.toLocaleString()} mi` : 'Not recorded'}</strong><span>{vehicle.odometerUpdatedAt ? `Updated ${niceDate(vehicle.odometerUpdatedAt)}` : ''}</span></div><div><small>Insurance carrier</small><strong>{insurance ? String(insurance.fields.carrier || insurance.title) : 'Not recorded'}</strong><span>{insurance?.fields.phone ? String(insurance.fields.phone) : ''}</span></div></div>
        {coverage.length > 0 && <section className="print-section print-coverage"><div className="print-section-heading"><h3>Insurance coverage</h3><span>Verify with your policy</span></div><div>{coverage.map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong><span>{item.note}</span></div>)}</div></section>}
        <section className="print-section"><div className="print-section-heading"><h3>Important documents</h3><span>{documents.length} saved</span></div>{documents.length ? <table><thead><tr><th>Document</th><th>Details</th><th>Expiration</th><th>Status</th></tr></thead><tbody>{documents.map((record) => <tr key={record.id}><td><strong>{categoryLabels[record.category]}</strong><span>{record.title}</span></td><td>{record.category === 'insurance' ? `${String(record.fields.carrier || '')}${record.fields.policyNumber ? ` · ${maskPolicy(record.fields.policyNumber)}` : ''}` : String(record.fields.station || record.fields.jurisdiction || record.fields.result || '—')}</td><td>{record.expirationDate ? niceDate(record.expirationDate) : 'No expiration'}</td><td>{record.expirationDate ? deadlineState(record.expirationDate).label : 'Saved'}</td></tr>)}</tbody></table> : <p className="print-empty">No documents recorded.</p>}</section>
        <section className="print-section"><div className="print-section-heading"><h3>Recent maintenance</h3><span>Latest {maintenance.length}</span></div>{maintenance.length ? <table><thead><tr><th>Date</th><th>Service</th><th>Provider</th><th>Mileage</th><th>Cost</th></tr></thead><tbody>{maintenance.map((record) => <tr key={record.id}><td>{niceDate(record.serviceDate)}</td><td>{record.categories.join(', ')}</td><td>{record.merchant}</td><td>{record.odometer?.toLocaleString() || '—'}</td><td>{money(record.totalCents)}</td></tr>)}</tbody></table> : <p className="print-empty">No maintenance recorded.</p>}</section>
        <footer className="print-footer"><p><strong>Printed {generated}</strong> · Full documents and photos remain in Garage Guide. VIN and policy identifiers are shortened for privacy.</p><p>This summary is for convenience and is not proof of insurance or registration. Keep legally required documents with the vehicle.</p></footer>
      </section>;
    })}
  </article>;
}

function EmptyCard({ icon: Icon, title, copy, action, onAction }: { icon: typeof FileText; title: string; copy: string; action: string; onAction: () => void }) {
  return <section className="empty-card"><span><Icon /></span><h3>{title}</h3><p>{copy}</p><button onClick={onAction}>{action}</button></section>;
}

function BottomNav({ view, setView, onAdd }: { view: View; setView: (view: View) => void; onAdd: () => void }) {
  const items: { id: View; label: string; icon: typeof Bell }[] = [{ id:'today', label:'Today', icon:Bell }, { id:'vehicles', label:'Vehicles', icon:CarFront }, { id:'records', label:'Records', icon:FileText }, { id:'settings', label:'Settings', icon:Settings }];
  return <nav className="bottom-nav" aria-label="Primary navigation"><button aria-label="Today" className={view === items[0].id ? 'active' : ''} onClick={() => setView(items[0].id)}><Bell /><span>Today</span></button><button aria-label="Vehicles" className={view === items[1].id ? 'active' : ''} onClick={() => setView(items[1].id)}><CarFront /><span>Vehicles</span></button><button className="add-fab" onClick={onAdd} aria-label="Add"><Plus /></button><button aria-label="Records" className={view === items[2].id ? 'active' : ''} onClick={() => setView(items[2].id)}><FileText /><span>Records</span></button><button aria-label="Settings" className={view === items[3].id ? 'active' : ''} onClick={() => setView(items[3].id)}><Settings /><span>Settings</span></button></nav>;
}

function LinkDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [inspected, setInspected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inspect = async (event: FormSubmitEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/link-preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const result = await response.json() as { url?: string; title?: string; description?: string; organization?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'This website could not be read.');
      setResolvedUrl(result.url); setTitle(result.title || new URL(result.url).hostname); setDescription(result.description || ''); setOrganization(result.organization || new URL(result.url).hostname); setInspected(true);
    } catch (caught) {
      try { const fallback = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); setResolvedUrl(fallback.href); setTitle(fallback.hostname.replace(/^www\./, '')); setOrganization(fallback.hostname); setInspected(true); setError('Garage Guide could not read this site automatically. You can finish the details below.'); } catch { setError(caught instanceof Error ? caught.message : 'Enter a complete website address.'); }
    } finally { setBusy(false); }
  };
  const save = async () => {
    if (!resolvedUrl || !title.trim()) { setError('Add a title before saving.'); return; }
    const now = new Date().toISOString(); const record: ResourceLinkRecord = { id: crypto.randomUUID(), url: resolvedUrl, title: title.trim(), description: description.trim() || undefined, organization: organization.trim() || undefined, createdAt: now, updatedAt: now };
    setBusy(true); await saveResourceLink(record); await onSaved(); setBusy(false);
  };
  return <Dialog open onOpenChange={(next) => !next && onClose()}><DialogContent className="app-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>Add a helpful website</DialogTitle><DialogDescription>Garage Guide will read the public page title and description, then let you review them before saving.</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><form className="app-form" onSubmit={inspect}><label>Website address<Input type="url" inputMode="url" value={url} onChange={(event) => { setUrl(event.target.value); setInspected(false); setError(''); }} placeholder="https://example.com" required /></label>{!inspected && <Button type="submit" className="submit-control" disabled={busy}>{busy ? 'Reading website…' : 'Read website'}</Button>}</form>{inspected && <div className="link-review"><div className="link-review-label"><Check />Website details found</div><label>Title<Input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Organization <span>optional</span><Input value={organization} onChange={(event) => setOrganization(event.target.value)} /></label><label>Description <span>optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><div className="link-preview-card"><span><small>{organization || new URL(resolvedUrl).hostname}</small><strong>{title}</strong>{description && <em>{description}</em>}</span><ExternalLink /></div><Button type="button" className="submit-control" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save link'}</Button></div>}{error && <p className="form-error" role="alert">{error}</p>}<p className="form-note"><Info />Only the website address is sent to retrieve its public page information.</p></DialogContent></Dialog>;
}

function AddDialog({ mode, setMode, snapshot, onSaved }: { mode: AddMode | null; setMode: (mode: AddMode | null) => void; snapshot: AppSnapshot; onSaved: () => Promise<void> }) {
  return <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}><DialogContent className={`app-dialog ${mode === 'vehicle' ? 'guided-dialog' : ''} max-sm:!translate-x-0 max-sm:!translate-y-0`} showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>{mode === 'vehicle' ? 'Vehicle setup' : mode === 'document' ? 'Add a document' : mode === 'maintenance' ? 'Add maintenance' : 'Add to your garage'}</DialogTitle><DialogDescription>{mode === 'vehicle' ? 'A few simple questions will create a useful vehicle profile.' : mode === 'document' ? 'The photo and details stay in this browser.' : mode === 'maintenance' ? 'Record service even when you do not have a receipt.' : 'What would you like to add?'}</DialogDescription></div><button className="dialog-close" onClick={() => setMode(null)} aria-label="Close"><X /></button></div></DialogHeader>{mode === 'menu' && <div className="add-menu"><button onClick={() => setMode('document')}><span><Camera /></span><div><strong>Scan a document</strong><small>Insurance, registration, inspection, or receipt</small></div><ChevronRight /></button><button onClick={() => setMode('maintenance')}><span><Wrench /></span><div><strong>Add maintenance</strong><small>Record service or a repair manually</small></div><ChevronRight /></button><button onClick={() => setMode('vehicle')}><span><CarFront /></span><div><strong>Add vehicle</strong><small>Create another vehicle profile</small></div><ChevronRight /></button></div>}{mode === 'vehicle' && <VehicleForm onSaved={onSaved} />}{mode === 'document' && <DocumentForm vehicles={snapshot.vehicles} onSaved={onSaved} />}{mode === 'maintenance' && <MaintenanceForm vehicles={snapshot.vehicles} onSaved={onSaved} />}</DialogContent></Dialog>;
}

function VehicleForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [values, setValues] = useState({ nickname: '', year: '', make: '', model: '', trim: '', vin: '', plate: '', mileage: '' });
  const update = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const next = () => {
    if (step === 0 && (!values.year || !values.make.trim() || !values.model.trim())) { setError('Add the year, make, and model to continue.'); return; }
    setError(''); setStep((current) => Math.min(3, current + 1));
  };
  const save = async () => { setBusy(true); const now = new Date().toISOString(); const vehicle: Vehicle = { id: crypto.randomUUID(), nickname: values.nickname.trim() || values.model.trim(), year: Number(values.year), make: values.make.trim(), model: values.model.trim(), trim: values.trim.trim(), vin: values.vin.trim().toUpperCase(), licensePlate: values.plate.trim().toUpperCase(), jurisdiction: 'VA', currentOdometer: values.mileage ? Number(values.mileage) : undefined, odometerUpdatedAt: values.mileage ? new Date().toISOString().slice(0,10) : undefined, createdAt: now, updatedAt: now }; await saveVehicle(vehicle); void navigator.storage?.persist?.(); await onSaved(); setBusy(false); };
  const stepNames = ['Basics', 'Identification', 'Mileage', 'Review'];
  return <div className="guided-form">
    <div className="wizard-progress"><div><span>Step {step + 1} of 4</span><strong>{stepNames[step]}</strong></div><div className="wizard-track" aria-hidden="true"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div></div>
    {step === 0 && <section className="wizard-step"><p className="eyebrow">First, the easy part</p><h2>What vehicle are we organizing?</h2><p>Year, make, and model are enough to get started.</p><div className="app-form"><div className="form-row"><label>Year<Input value={values.year} onChange={(event) => update('year', event.target.value)} type="number" inputMode="numeric" min="1900" max="2100" placeholder="2024" /></label><label>Make<Input value={values.make} onChange={(event) => update('make', event.target.value)} placeholder="Honda" /></label></div><label>Model<Input value={values.model} onChange={(event) => update('model', event.target.value)} placeholder="CR-V" /></label><div className="form-row"><label>Nickname <span>optional</span><Input value={values.nickname} onChange={(event) => update('nickname', event.target.value)} placeholder="Family car" /></label><label>Trim <span>optional</span><Input value={values.trim} onChange={(event) => update('trim', event.target.value)} placeholder="EX-L" /></label></div></div></section>}
    {step === 1 && <section className="wizard-step"><p className="eyebrow">Helpful in an emergency</p><h2>Do you have its identifying details?</h2><p>Both are optional. You can find the VIN on your registration, insurance card, or driver-side dashboard.</p><div className="app-form"><label>VIN <span>optional</span><Input value={values.vin} onChange={(event) => update('vin', event.target.value)} maxLength={17} autoCapitalize="characters" placeholder="17-character VIN" /></label><label>License plate <span>optional</span><Input value={values.plate} onChange={(event) => update('plate', event.target.value)} placeholder="ABC-1234" /></label><div className="why-card"><Info /><p><strong>Why we ask</strong>The VIN helps you check recalls and match records to the right vehicle. It never leaves this browser unless you later choose a VIN lookup.</p></div></div></section>}
    {step === 2 && <section className="wizard-step"><p className="eyebrow">One last detail</p><h2>About how many miles are on it?</h2><p>Mileage helps make maintenance reminders more useful. An estimate is fine, and you can update it later.</p><div className="app-form"><label>Current mileage <span>optional</span><Input value={values.mileage} onChange={(event) => update('mileage', event.target.value)} type="number" inputMode="numeric" min="0" placeholder="46,520" /></label></div></section>}
    {step === 3 && <section className="wizard-step review-step"><p className="eyebrow">Looks good</p><h2>Here’s what will be saved.</h2><div className="vehicle-review"><span className="vehicle-hero-icon"><CarFront /></span><div><strong>{values.nickname || values.model}</strong><h3>{values.year} {values.make} {values.model}</h3><p>{[values.trim, values.mileage && `${Number(values.mileage).toLocaleString()} miles`].filter(Boolean).join(' · ') || 'Ready for documents and deadlines'}</p></div></div><div className="review-facts"><div><small>VIN</small><strong>{values.vin || 'Add later'}</strong></div><div><small>Plate</small><strong>{values.plate || 'Add later'}</strong></div></div><p className="form-note"><ShieldCheck />Saved only in this browser on this device.</p></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="wizard-actions">{step > 0 ? <button className="wizard-back" onClick={() => { setError(''); setStep((current) => current - 1); }}>Back</button> : <span />}{step < 3 ? <button className="wizard-next" onClick={next}>Continue<ChevronRight /></button> : <button className="wizard-next" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save vehicle'}<Check /></button>}</footer>
  </div>;
}

function EditVehicleDialog({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState({ nickname: vehicle.nickname, year: String(vehicle.year), make: vehicle.make, model: vehicle.model, trim: vehicle.trim || '', vin: vehicle.vin || '', plate: vehicle.licensePlate || '', mileage: vehicle.currentOdometer?.toString() || '' });
  const update = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const save = async (event: FormSubmitEvent) => {
    event.preventDefault();
    if (!values.year || !values.make.trim() || !values.model.trim()) { setError('Year, make, and model are required.'); return; }
    const vin = values.vin.trim().toUpperCase();
    const vinChanged = vin !== (vehicle.vin || '').trim().toUpperCase();
    const mileage = values.mileage.trim() ? Number(values.mileage) : undefined;
    if (mileage !== undefined && (!Number.isFinite(mileage) || mileage < 0)) { setError('Mileage must be a positive number or left blank.'); return; }
    setBusy(true); setError('');
    try {
      await saveVehicle({ ...vehicle, nickname: values.nickname.trim() || values.model.trim(), year: Number(values.year), make: values.make.trim(), model: values.model.trim(), trim: values.trim.trim(), vin, licensePlate: values.plate.trim().toUpperCase(), currentOdometer: mileage, odometerUpdatedAt: mileage !== vehicle.currentOdometer ? new Date().toISOString().slice(0, 10) : vehicle.odometerUpdatedAt, vinLookup: vinChanged ? undefined : vehicle.vinLookup, updatedAt: new Date().toISOString() });
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The vehicle details could not be updated.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="app-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>Edit vehicle</DialogTitle><DialogDescription>Correct any vehicle detail without affecting its documents or maintenance records.</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><form className="app-form" onSubmit={save}><div className="form-row"><label>Year<Input value={values.year} onChange={(event) => update('year', event.target.value)} type="number" inputMode="numeric" min="1900" max="2100" required /></label><label>Make<Input value={values.make} onChange={(event) => update('make', event.target.value)} required /></label></div><label>Model<Input value={values.model} onChange={(event) => update('model', event.target.value)} required /></label><div className="form-row"><label>Nickname <span>optional</span><Input value={values.nickname} onChange={(event) => update('nickname', event.target.value)} /></label><label>Trim <span>optional</span><Input value={values.trim} onChange={(event) => update('trim', event.target.value)} /></label></div><label>VIN <span>optional</span><Input value={values.vin} onChange={(event) => update('vin', event.target.value)} maxLength={17} autoCapitalize="characters" /></label>{vehicle.vinLookup && <p className="form-note"><Info />Changing the VIN removes the saved VIN details and recall check. You can run a new check after saving.</p>}<div className="form-row"><label>License plate <span>optional</span><Input value={values.plate} onChange={(event) => update('plate', event.target.value)} autoCapitalize="characters" /></label><label>Current mileage <span>optional</span><Input value={values.mileage} onChange={(event) => update('mileage', event.target.value)} type="number" inputMode="numeric" min="0" /></label></div>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" className="submit-control" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check /></Button></form></DialogContent></Dialog>;
}

function DocumentForm({ vehicles, onSaved }: { vehicles: Vehicle[]; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [category, setCategory] = useState<DocumentCategory>('insurance');
  usePhotoPaste(setFile, file);
  const submit = async (event: FormSubmitEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const data = new FormData(event.currentTarget); const id = crypto.randomUUID(); const assets = file ? await prepareDocumentImages(file, id) : []; const now = new Date().toISOString(); const savedCategory = data.get('category') as DocumentCategory; const field = (name: string) => String(data.get(name) || ''); const record: DocumentRecord = { id, vehicleId: String(data.get('vehicleId')), category: savedCategory, title: String(data.get('title') || categoryLabels[savedCategory]), issueDate: String(data.get('issueDate')), expirationDate: String(data.get('expirationDate') || '') || undefined, primaryImageId: assets.find((asset) => asset.role === 'document')?.id, thumbnailImageId: assets.find((asset) => asset.role === 'thumbnail')?.id, fields: { carrier: field('issuer'), policyNumber: field('reference'), phone: field('phone'), bodilyInjuryPerPerson: field('bodilyInjuryPerPerson'), bodilyInjuryPerAccident: field('bodilyInjuryPerAccident'), propertyDamage: field('propertyDamage'), uninsuredPerPerson: field('uninsuredPerPerson'), uninsuredPerAccident: field('uninsuredPerAccident'), medicalPayments: field('medicalPayments'), collisionDeductible: field('collisionDeductible'), comprehensiveDeductible: field('comprehensiveDeductible'), rentalCoverage: field('rentalCoverage'), roadsideCoverage: field('roadsideCoverage') }, extractionStatus: 'confirmed', notes: String(data.get('notes') || ''), createdAt: now, updatedAt: now }; await saveDocument(record, assets); await onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The document could not be saved.'); } finally { setBusy(false); } };
  return <form className="app-form" onSubmit={submit}><label>Vehicle<NativeSelect name="vehicleId" required>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname} · {vehicle.year} {vehicle.make}</option>)}</NativeSelect></label><label>Document type<NativeSelect name="category" required value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}><option value="insurance">Insurance</option><option value="registration">Registration</option><option value="inspection">Safety inspection</option><option value="emissions">Emissions test</option><option value="maintenance">Maintenance receipt</option><option value="other">Other document</option></NativeSelect></label><label className="photo-input"><span className="photo-icon"><Camera /></span><span><strong>{file ? file.name : 'Take or choose a photo'}</strong><small>Flat surface · all corners visible · avoid glare</small></span><Input name="photo" type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label>Title<Input name="title" placeholder="Travelers insurance card" /></label><div className="form-row"><label>Issue or service date<Input name="issueDate" type="date" required /></label><label>Expiration date <span>optional</span><Input name="expirationDate" type="date" /></label></div><div className="form-row"><label>Issuer or merchant <span>optional</span><Input name="issuer" placeholder="Travelers" /></label><label>Policy or reference no. <span>optional</span><Input name="reference" /></label></div>{category === 'insurance' && <fieldset className="coverage-fields"><legend>Coverage limits</legend><p>Copy the amounts from your policy declarations page. Leave anything that does not apply blank.</p><label>Claims phone <span>optional</span><Input name="phone" type="tel" inputMode="tel" placeholder="800-555-0123" /></label><div className="coverage-form-group"><strong>Bodily injury liability</strong><div className="form-row"><label>Bodily injury per person ($)<Input name="bodilyInjuryPerPerson" type="number" inputMode="numeric" min="0" placeholder="250000" /></label><label>Bodily injury per accident ($)<Input name="bodilyInjuryPerAccident" type="number" inputMode="numeric" min="0" placeholder="500000" /></label></div></div><div className="form-row"><label>Property damage, per accident ($)<Input name="propertyDamage" type="number" inputMode="numeric" min="0" placeholder="100000" /></label><label>Medical payments / PIP ($)<Input name="medicalPayments" type="number" inputMode="numeric" min="0" placeholder="5000" /></label></div><div className="coverage-form-group"><strong>Uninsured / underinsured motorist</strong><div className="form-row"><label>Uninsured motorist per person ($)<Input name="uninsuredPerPerson" type="number" inputMode="numeric" min="0" placeholder="250000" /></label><label>Uninsured motorist per accident ($)<Input name="uninsuredPerAccident" type="number" inputMode="numeric" min="0" placeholder="500000" /></label></div></div><div className="form-row"><label>Collision deductible ($)<Input name="collisionDeductible" type="number" inputMode="numeric" min="0" placeholder="500" /></label><label>Comprehensive deductible ($)<Input name="comprehensiveDeductible" type="number" inputMode="numeric" min="0" placeholder="100" /></label></div><div className="form-row"><label>Rental reimbursement <span>optional</span><Input name="rentalCoverage" placeholder="$50/day · $1,500 max" /></label><label>Roadside assistance <span>optional</span><NativeSelect name="roadsideCoverage"><option value="">Not recorded</option><option>Included</option><option>Not included</option></NativeSelect></label></div></fieldset>}<label>Notes <span>optional</span><Input name="notes" /></label>{error && <p className="form-error" role="alert">{error}</p>}<p className="form-note"><ShieldCheck />This version stores and processes the photo only on this device.</p><Button type="submit" className="submit-control" disabled={busy}>{busy ? 'Preparing photo…' : 'Save document'}</Button></form>;
}

function EditDocumentDialog({ record, vehicles, onClose, onSaved }: { record: DocumentRecord; vehicles: Vehicle[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(record.category);
  usePhotoPaste(setFile, file);
  const [values, setValues] = useState({ vehicleId: record.vehicleId, title: record.title, issueDate: record.issueDate, expirationDate: record.expirationDate || '', issuer: String(record.fields.carrier || ''), reference: String(record.fields.policyNumber || ''), phone: String(record.fields.phone || ''), bodilyInjuryPerPerson: String(record.fields.bodilyInjuryPerPerson || ''), bodilyInjuryPerAccident: String(record.fields.bodilyInjuryPerAccident || ''), propertyDamage: String(record.fields.propertyDamage || ''), uninsuredPerPerson: String(record.fields.uninsuredPerPerson || ''), uninsuredPerAccident: String(record.fields.uninsuredPerAccident || ''), medicalPayments: String(record.fields.medicalPayments || ''), collisionDeductible: String(record.fields.collisionDeductible || ''), comprehensiveDeductible: String(record.fields.comprehensiveDeductible || ''), rentalCoverage: String(record.fields.rentalCoverage || ''), roadsideCoverage: String(record.fields.roadsideCoverage || ''), notes: record.notes || '' });
  const update = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));
  const save = async (event: FormSubmitEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const assets = file ? await prepareDocumentImages(file, record.id) : [];
      const newPrimaryImageId = assets.find((asset) => asset.role === 'document')?.id || record.primaryImageId;
      const newThumbnailImageId = assets.find((asset) => asset.role === 'thumbnail')?.id || record.thumbnailImageId;
      const replacedImageIds = assets.length ? [record.primaryImageId, record.thumbnailImageId].filter((id): id is string => Boolean(id)) : [];
      await saveDocument({ ...record, vehicleId: values.vehicleId, category, title: values.title.trim() || categoryLabels[category], issueDate: values.issueDate, expirationDate: values.expirationDate || undefined, primaryImageId: newPrimaryImageId, thumbnailImageId: newThumbnailImageId, fields: { carrier: values.issuer, policyNumber: values.reference, phone: values.phone, bodilyInjuryPerPerson: values.bodilyInjuryPerPerson, bodilyInjuryPerAccident: values.bodilyInjuryPerAccident, propertyDamage: values.propertyDamage, uninsuredPerPerson: values.uninsuredPerPerson, uninsuredPerAccident: values.uninsuredPerAccident, medicalPayments: values.medicalPayments, collisionDeductible: values.collisionDeductible, comprehensiveDeductible: values.comprehensiveDeductible, rentalCoverage: values.rentalCoverage, roadsideCoverage: values.roadsideCoverage }, notes: values.notes, updatedAt: new Date().toISOString() }, assets, replacedImageIds);
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The record could not be updated.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="app-dialog record-edit-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><DialogTitle>Edit record</DialogTitle><DialogDescription>Update the details, or take or choose a new photo of this document.</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><form className="app-form" onSubmit={save}><label>Vehicle<NativeSelect value={values.vehicleId} onChange={(event) => update('vehicleId', event.target.value)} required>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname} · {vehicle.year} {vehicle.make}</option>)}</NativeSelect></label><label>Document type<NativeSelect value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}><option value="insurance">Insurance</option><option value="registration">Registration</option><option value="inspection">Safety inspection</option><option value="emissions">Emissions test</option><option value="maintenance">Maintenance receipt</option><option value="other">Other document</option></NativeSelect></label><label className="photo-input"><span className="photo-icon"><Camera /></span><span><strong>{file ? file.name : record.primaryImageId ? 'Replace current photo' : 'Take or choose a photo'}</strong><small>{file ? 'New photo ready to save' : record.primaryImageId ? 'Your current photo stays until you save a replacement.' : 'Use your camera or choose an image file.'}</small></span><Input type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label>Title<Input value={values.title} onChange={(event) => update('title', event.target.value)} /></label><div className="form-row"><label>Issue or service date<Input value={values.issueDate} onChange={(event) => update('issueDate', event.target.value)} type="date" required /></label><label>Expiration date <span>optional</span><Input value={values.expirationDate} onChange={(event) => update('expirationDate', event.target.value)} type="date" /></label></div><div className="form-row"><label>Issuer or merchant <span>optional</span><Input value={values.issuer} onChange={(event) => update('issuer', event.target.value)} /></label><label>Policy or reference no. <span>optional</span><Input value={values.reference} onChange={(event) => update('reference', event.target.value)} /></label></div>{category === 'insurance' && <fieldset className="coverage-fields"><legend>Coverage limits</legend><p>Copy amounts from the policy declarations page. Leave anything that does not apply blank.</p><label>Claims phone <span>optional</span><Input value={values.phone} onChange={(event) => update('phone', event.target.value)} type="tel" inputMode="tel" /></label><div className="coverage-form-group"><strong>Bodily injury liability</strong><div className="form-row"><label>Per person ($)<Input value={values.bodilyInjuryPerPerson} onChange={(event) => update('bodilyInjuryPerPerson', event.target.value)} type="number" inputMode="numeric" min="0" /></label><label>Per accident ($)<Input value={values.bodilyInjuryPerAccident} onChange={(event) => update('bodilyInjuryPerAccident', event.target.value)} type="number" inputMode="numeric" min="0" /></label></div></div><div className="form-row"><label>Property damage, per accident ($)<Input value={values.propertyDamage} onChange={(event) => update('propertyDamage', event.target.value)} type="number" inputMode="numeric" min="0" /></label><label>Medical payments / PIP ($)<Input value={values.medicalPayments} onChange={(event) => update('medicalPayments', event.target.value)} type="number" inputMode="numeric" min="0" /></label></div><div className="coverage-form-group"><strong>Uninsured / underinsured motorist</strong><div className="form-row"><label>Per person ($)<Input value={values.uninsuredPerPerson} onChange={(event) => update('uninsuredPerPerson', event.target.value)} type="number" inputMode="numeric" min="0" /></label><label>Per accident ($)<Input value={values.uninsuredPerAccident} onChange={(event) => update('uninsuredPerAccident', event.target.value)} type="number" inputMode="numeric" min="0" /></label></div></div><div className="form-row"><label>Collision deductible ($)<Input value={values.collisionDeductible} onChange={(event) => update('collisionDeductible', event.target.value)} type="number" inputMode="numeric" min="0" /></label><label>Comprehensive deductible ($)<Input value={values.comprehensiveDeductible} onChange={(event) => update('comprehensiveDeductible', event.target.value)} type="number" inputMode="numeric" min="0" /></label></div><div className="form-row"><label>Rental reimbursement <span>optional</span><Input value={values.rentalCoverage} onChange={(event) => update('rentalCoverage', event.target.value)} /></label><label>Roadside assistance <span>optional</span><NativeSelect value={values.roadsideCoverage} onChange={(event) => update('roadsideCoverage', event.target.value)}><option value="">Not recorded</option><option>Included</option><option>Not included</option></NativeSelect></label></div></fieldset>}<label>Notes <span>optional</span><Input value={values.notes} onChange={(event) => update('notes', event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" className="submit-control" disabled={busy}>{busy ? 'Saving…' : 'Save record'}<Check /></Button></form></DialogContent></Dialog>;
}

function MaintenanceForm({ vehicles, onSaved }: { vehicles: Vehicle[]; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormSubmitEvent) => { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const now = new Date().toISOString(); await saveMaintenance({ id: crypto.randomUUID(), vehicleId: String(data.get('vehicleId')), serviceDate: String(data.get('serviceDate')), odometer: data.get('odometer') ? Number(data.get('odometer')) : undefined, merchant: String(data.get('merchant')), totalCents: Math.round(Number(data.get('total')) * 100), currency: 'USD', categories: [String(data.get('category'))], notes: String(data.get('notes') || ''), createdAt: now, updatedAt: now }); await onSaved(); setBusy(false); };
  return <form className="app-form" onSubmit={submit}><label>Vehicle<NativeSelect name="vehicleId">{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname} · {vehicle.year} {vehicle.make}</option>)}</NativeSelect></label><label>Service category<NativeSelect name="category"><option>Oil & filter</option><option>Brake pads</option><option>Tires</option><option>Battery</option><option>Fluids</option><option>Engine</option><option>Other</option></NativeSelect></label><div className="form-row"><label>Service date<Input name="serviceDate" type="date" required /></label><label>Odometer <span>optional</span><Input name="odometer" type="number" inputMode="numeric" min="0" /></label></div><label>Shop or provider<Input name="merchant" required placeholder="Local service center" /></label><label>Total paid<Input name="total" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="84.25" /></label><label>Notes <span>optional</span><Input name="notes" /></label><Button type="submit" className="submit-control" disabled={busy}>{busy ? 'Saving…' : 'Save maintenance'}</Button></form>;
}

function vinFormatError(vin: string) {
  if (vin.length !== 17) return 'A complete VIN has 17 characters.';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return 'VINs use letters and numbers but never I, O, or Q.';
  return '';
}

function vinCheckDigitIsValid(vin: string) {
  const values: Record<string, number> = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  const total = vin.split('').reduce((sum, character, index) => sum + (Number(character) || values[character] || 0) * weights[index], 0);
  const expected = total % 11 === 10 ? 'X' : String(total % 11);
  return vin[8] === expected;
}

function maintenanceStartingPoints(vehicle: Vehicle, fuelType?: string) {
  const electric = fuelType?.toLowerCase().includes('electric');
  const mileage = vehicle.currentOdometer;
  const next = (interval: number) => mileage === undefined ? `Every ${interval.toLocaleString()} miles` : `Plan around ${((Math.floor(mileage / interval) + 1) * interval).toLocaleString()} miles`;
  return [
    ...(!electric ? [{ label: 'Oil and filter', timing: next(7500) }] : []),
    { label: 'Rotate and inspect tires', timing: next(7500) },
    { label: 'Inspect brakes', timing: 'At least yearly or as the owner’s manual specifies' },
    { label: 'Cabin air filter', timing: next(20000) },
    { label: electric ? 'Battery and cooling system' : 'Fluids and cooling system', timing: 'Follow the manufacturer’s time and mileage schedule' },
  ];
}

function VinLookupDialog({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => Promise<void> }) {
  const [result, setResult] = useState<NonNullable<Vehicle['vinLookup']> | null>(vehicle.vinLookup || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const vin = String(vehicle.vin || '').toUpperCase();
  const lookup = async () => {
    const formatError = vinFormatError(vin);
    if (formatError) { setError(formatError); return; }
    setBusy(true); setError('');
    try {
      const decodeResponse = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json&modelyear=${vehicle.year}`);
      if (!decodeResponse.ok) throw new Error('NHTSA could not decode this VIN right now.');
      const decodePayload = await decodeResponse.json() as { Results?: Array<Record<string, string>> };
      const decoded = decodePayload.Results?.[0];
      if (!decoded) throw new Error('NHTSA returned no vehicle details for this VIN.');
      const decoderValid = String(decoded.ErrorCode || '').split(',').every((code) => code.trim() === '0');
      const locallyValid = vinCheckDigitIsValid(vin);
      let recalls: NonNullable<Vehicle['vinLookup']>['recalls'] = [];
      let recallsChecked = false;
      if (decoded.Make && decoded.Model && decoded.ModelYear) {
        const recallUrl = new URL('https://api.nhtsa.gov/recalls/recallsByVehicle');
        recallUrl.searchParams.set('make', decoded.Make); recallUrl.searchParams.set('model', decoded.Model); recallUrl.searchParams.set('modelYear', decoded.ModelYear);
        const recallResponse = await fetch(recallUrl);
        if (recallResponse.ok) {
          recallsChecked = true;
          const recallPayload = await recallResponse.json() as { results?: Array<Record<string, string | boolean>> };
          const isWarningFlag = (value: unknown) => value === true || ['true', 'y', 'yes'].includes(String(value).toLowerCase());
          recalls = (recallPayload.results || []).map((item) => ({ campaignNumber: String(item.NHTSACampaignNumber || ''), component: String(item.Component || 'Vehicle recall'), summary: String(item.Summary || ''), consequence: String(item.Consequence || ''), remedy: String(item.Remedy || ''), reportDate: String(item.ReportReceivedDate || ''), parkIt: isWarningFlag(item.parkIt), parkOutside: isWarningFlag(item.parkOutSide) }));
        }
      }
      setResult({ checkedAt: new Date().toISOString(), source: 'NHTSA vPIC and Recalls API', valid: decoderValid && locallyValid, errorText: [!locallyValid ? 'The VIN check digit does not match.' : '', !decoderValid ? decoded.ErrorText : ''].filter(Boolean).join(' '), recallsChecked, details: { make: decoded.Make, model: decoded.Model, modelYear: decoded.ModelYear, manufacturer: decoded.Manufacturer, vehicleType: decoded.VehicleType, bodyClass: decoded.BodyClass, fuelType: decoded.FuelTypePrimary, engine: [decoded.EngineCylinders && `${decoded.EngineCylinders} cylinders`, decoded.DisplacementL && `${decoded.DisplacementL} L`].filter(Boolean).join(' · '), driveType: decoded.DriveType, plant: [decoded.PlantCity, decoded.PlantState, decoded.PlantCountry].filter(Boolean).join(', ') }, recalls });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The VIN lookup could not be completed.'); }
    finally { setBusy(false); }
  };
  const save = async () => { if (!result) return; setBusy(true); await saveVehicle({ ...vehicle, vinLookup: result, updatedAt: new Date().toISOString() }); await onSaved(); setBusy(false); };
  const guidance = maintenanceStartingPoints(vehicle, result?.details.fuelType);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="vin-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><p className="eyebrow">Official vehicle check</p><DialogTitle>VIN details & recalls</DialogTitle><DialogDescription>{vehicle.nickname} · VIN ending {vin.slice(-6)}</DialogDescription></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader>
    {!result && <section className="vin-consent"><span className="vin-shield"><ShieldCheck /></span><h2>Check this VIN with NHTSA?</h2><p>Garage Guide will send this 17-character VIN and the model year to two public U.S. government services: NHTSA’s VIN decoder and recall database. No documents, insurance details, mileage, or other garage records are sent.</p><div className="vin-local-check"><Check /><span><strong>Local format check</strong>{vinFormatError(vin) || (vinCheckDigitIsValid(vin) ? 'The length, characters, and check digit look valid.' : 'The VIN’s check digit does not match. NHTSA can provide additional detail.')}</span></div><button className="vin-primary" onClick={lookup} disabled={busy || Boolean(vinFormatError(vin))}>{busy ? 'Checking NHTSA…' : 'Send VIN and check'}<ChevronRight /></button></section>}
    {result && <div className="vin-results"><section className={`vin-verdict ${result.valid ? 'valid' : 'warning'}`}><span>{result.valid ? <Check /> : <Info />}</span><div><p className="eyebrow">VIN result</p><h2>{result.valid ? 'The VIN decoded successfully.' : 'This VIN needs review.'}</h2>{result.errorText && <p>{result.errorText}</p>}<small>Checked {new Date(result.checkedAt).toLocaleString()} · Source: {result.source}</small></div></section>
      <section className="vin-section"><div className="section-heading"><div><p className="eyebrow">Decoded by NHTSA</p><h2>Vehicle details</h2></div></div><div className="vin-detail-grid">{Object.entries({ 'Year, make & model': [result.details.modelYear, result.details.make, result.details.model].filter(Boolean).join(' '), 'Vehicle type': result.details.vehicleType, 'Body style': result.details.bodyClass, 'Fuel': result.details.fuelType, 'Engine': result.details.engine, 'Drive type': result.details.driveType, 'Manufacturer': result.details.manufacturer, 'Assembly plant': result.details.plant }).filter(([, value]) => value).map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><p className="source-note">Decoded details are suggestions until you confirm them against the vehicle or its documents.</p></section>
      <section className="vin-section"><div className="section-heading"><div><p className="eyebrow">Safety check</p><h2>{result.recalls.length ? `${result.recalls.length} recall${result.recalls.length === 1 ? '' : 's'} found` : result.recallsChecked ? 'No recalls found' : 'Recall check unavailable'}</h2></div><a href={`https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`} target="_blank" rel="noreferrer">Verify with NHTSA<ExternalLink /></a></div>{result.recalls.length ? <div className="recall-list">{result.recalls.map((recall) => <article key={recall.campaignNumber}><div><span>{recall.component}</span><strong>{recall.campaignNumber}</strong></div>{(recall.parkIt || recall.parkOutside) && <p className="urgent-recall">Important parking or driving warning—open the official NHTSA record now.</p>}<p>{recall.summary}</p>{recall.remedy && <details><summary>Remedy information</summary><p>{recall.remedy}</p></details>}</article>)}</div> : <p className="source-note">{result.recallsChecked ? 'Results can change. Check NHTSA again periodically and contact the manufacturer or a dealer with questions.' : 'The automatic recall search did not complete. Use the official NHTSA link to check this VIN directly.'}</p>}</section>
      <section className="vin-section"><div className="section-heading"><div><p className="eyebrow">Planning aid</p><h2>Maintenance starting points</h2></div></div><div className="maintenance-guide">{guidance.map((item) => <div key={item.label}><Check /><span><strong>{item.label}</strong><small>{item.timing}</small></span></div>)}</div><p className="source-note">These are general planning prompts, not the manufacturer’s schedule. Confirm every interval in the owner’s manual before relying on it.</p></section>
      <div className="vin-actions"><button onClick={() => { setResult(null); setError(''); }}>Check again</button><button className="vin-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save checked details'}<Check /></button></div>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </DialogContent></Dialog>;
}

function DocumentViewer({ record, vehicle, imageUrl, onClose, onEdit, notify }: { record: DocumentRecord | null; vehicle?: Vehicle; imageUrl: string | null; onClose: () => void; onEdit: () => void; notify: (message: string) => void }) {
  const [revealed, setRevealed] = useState(false); if (!record) return null;
  const coverage = insuranceCoverageItems(record);
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="viewer-dialog max-sm:!translate-x-0 max-sm:!translate-y-0" showCloseButton={false}><DialogHeader><div className="dialog-heading"><div><p className="eyebrow">{vehicle?.nickname} · {categoryLabels[record.category]}</p><DialogTitle>{record.title}</DialogTitle><DialogDescription>{record.expirationDate ? `Expires ${niceDate(record.expirationDate)}` : `Dated ${niceDate(record.issueDate)}`}</DialogDescription><button className="text-button viewer-edit-button" onClick={onEdit}>Edit record<Pencil /></button></div><button className="dialog-close" onClick={onClose} aria-label="Close"><X /></button></div></DialogHeader><div className="viewer-layout"><div className="viewer-facts"><div><small>Status</small><strong>{record.expirationDate ? deadlineState(record.expirationDate).label : 'Saved'}</strong></div>{record.category === 'insurance' && <div><small>Policy number</small><strong>{revealed ? String(record.fields.policyNumber || 'Not recorded') : maskPolicy(record.fields.policyNumber)}</strong>{record.fields.policyNumber && <button onClick={() => setRevealed(!revealed)}>{revealed ? 'Hide' : 'Reveal'}</button>}{revealed && <button onClick={async () => { await navigator.clipboard.writeText(String(record.fields.policyNumber)); notify('Policy number copied'); }}><Copy />Copy</button>}</div>}<div><small>Issue or service date</small><strong>{niceDate(record.issueDate)}</strong></div>{record.expirationDate && <div><small>Expiration</small><strong>{niceDate(record.expirationDate)}</strong></div>}{record.category === 'insurance' && <section className="viewer-coverage"><h3>Coverage limits</h3>{coverage.length ? coverage.map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong><span>{item.note}</span></div>) : <p>Not recorded for this policy.</p>}</section>}</div><div className="document-preview">{imageUrl ? <img src={imageUrl} alt={`Stored ${record.title}`} /> : <div className="no-photo"><FileText /><strong>No photo attached</strong><p>The structured record is still available.</p></div>}</div></div></DialogContent></Dialog>;
}

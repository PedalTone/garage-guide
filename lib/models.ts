export type Vehicle = {
  id: string;
  nickname: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  licensePlate?: string;
  jurisdiction: string;
  currentOdometer?: number;
  odometerUpdatedAt?: string;
  vinLookup?: {
    checkedAt: string;
    source: 'NHTSA vPIC and Recalls API';
    valid: boolean;
    errorText?: string;
    recallsChecked: boolean;
    details: {
      make?: string;
      model?: string;
      modelYear?: string;
      manufacturer?: string;
      vehicleType?: string;
      bodyClass?: string;
      fuelType?: string;
      engine?: string;
      driveType?: string;
      plant?: string;
    };
    recalls: Array<{
      campaignNumber: string;
      component: string;
      summary: string;
      consequence?: string;
      remedy?: string;
      reportDate?: string;
      parkIt?: boolean;
      parkOutside?: boolean;
    }>;
  };
  createdAt: string;
  updatedAt: string;
};

export type DocumentCategory =
  | 'registration'
  | 'insurance'
  | 'emissions'
  | 'inspection'
  | 'maintenance'
  | 'other';

export type DocumentRecord = {
  id: string;
  vehicleId: string;
  category: DocumentCategory;
  title: string;
  issueDate: string;
  expirationDate?: string;
  primaryImageId?: string;
  thumbnailImageId?: string;
  fields: Record<string, string | number>;
  notes?: string;
  extractionStatus: 'not_run' | 'review_needed' | 'confirmed' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  receiptDocumentId?: string;
  serviceDate: string;
  odometer?: number;
  merchant: string;
  totalCents: number;
  currency: 'USD';
  categories: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ImageAsset = {
  id: string;
  documentId: string;
  role: 'document' | 'thumbnail';
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  originalFilename: string;
  createdAt: string;
};

export type ResourceLinkRecord = {
  id: string;
  url: string;
  title: string;
  description?: string;
  organization?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSnapshot = {
  vehicles: Vehicle[];
  documents: DocumentRecord[];
  maintenanceRecords: MaintenanceRecord[];
  resourceLinks: ResourceLinkRecord[];
};

export const categoryLabels: Record<DocumentCategory, string> = {
  registration: 'Registration',
  insurance: 'Insurance',
  emissions: 'Emissions',
  inspection: 'Safety inspection',
  maintenance: 'Maintenance receipt',
  other: 'Other document',
};

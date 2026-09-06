import type { AppSnapshot } from './models';

const now = '2026-09-02T12:00:00.000Z';

export const sampleGarage: AppSnapshot = {
  vehicles: [
    { id: 'sample-outback', nickname: 'Outback', year: 2021, make: 'Subaru', model: 'Outback', trim: 'Limited', vin: '4S4BTANC9M0000000', licensePlate: 'VA SAMPLE', jurisdiction: 'VA', currentOdometer: 46520, odometerUpdatedAt: '2026-08-20', createdAt: now, updatedAt: now },
    { id: 'sample-civic', nickname: 'Civic', year: 2018, make: 'Honda', model: 'Civic', trim: 'EX', licensePlate: 'DEMO 18', jurisdiction: 'VA', currentOdometer: 72140, odometerUpdatedAt: '2026-07-12', createdAt: now, updatedAt: now },
  ],
  documents: [
    { id: 'sample-insurance', vehicleId: 'sample-outback', category: 'insurance', title: 'Travelers insurance card', issueDate: '2026-03-20', expirationDate: '2026-09-20', fields: { carrier: 'Travelers', policyNumber: 'SAMPLE-4821', phone: '800-555-0100', bodilyInjuryPerPerson: '250000', bodilyInjuryPerAccident: '500000', propertyDamage: '100000', uninsuredPerPerson: '250000', uninsuredPerAccident: '500000', medicalPayments: '5000', collisionDeductible: '500', comprehensiveDeductible: '100', rentalCoverage: '$50/day · $1,500 max', roadsideCoverage: 'Included' }, extractionStatus: 'confirmed', createdAt: now, updatedAt: now },
    { id: 'sample-registration', vehicleId: 'sample-civic', category: 'registration', title: 'Virginia registration', issueDate: '2025-11-14', expirationDate: '2026-11-14', fields: { jurisdiction: 'Virginia', plate: 'DEMO 18' }, extractionStatus: 'confirmed', createdAt: now, updatedAt: now },
    { id: 'sample-inspection', vehicleId: 'sample-outback', category: 'inspection', title: 'Virginia safety inspection', issueDate: '2026-01-08', expirationDate: '2027-01-31', fields: { result: 'Pass', station: 'Sample Service Center' }, extractionStatus: 'confirmed', createdAt: now, updatedAt: now },
  ],
  maintenanceRecords: [
    { id: 'sample-oil', vehicleId: 'sample-outback', serviceDate: '2026-04-12', odometer: 42180, merchant: 'Sample Auto Care', totalCents: 8425, currency: 'USD', categories: ['Oil & filter'], createdAt: now, updatedAt: now },
    { id: 'sample-brakes', vehicleId: 'sample-civic', serviceDate: '2026-02-18', odometer: 68102, merchant: 'Sample Auto Care', totalCents: 46890, currency: 'USD', categories: ['Brake pads'], createdAt: now, updatedAt: now },
  ],
  resourceLinks: [],
};

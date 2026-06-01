export interface DoctorProfile {
  name: string;
  licenseNumber: string;
  specialty: string;
  institution: string;
  registeredAt: bigint;
}

export interface DoctorIdentity {
  address: string;
  name: string;
  licenseNumber: string;
  specialty: string;
  institution: string;
  registeredAt: bigint | null;
  isVerified: boolean; // Registered/verified in the contract system
  displayName: string; // "Dr. Name" or formatted wallet address
  displaySubtitle: string; // "Specialty — Institution" or fallback
  formattedAddress: string; // "0x1234...5678"
}

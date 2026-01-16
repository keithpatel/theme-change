export interface PaymentRecord {
  [year: number]: {
    [month: number]: number | boolean; // number for amount, boolean for legacy support
  };
}

export interface Member {
  id: string; // Firestore Doc ID
  uniqueId: string; // 5-digit ID
  name: string;
  phone: string;
  address?: string;
  joinedDate: string;
  payments: PaymentRecord;
  lateFees?: {
    [year: number]: {
      [month: number]: number;
    };
  };
}

export interface Repayment {
  amount: number;
  date: string;
  note?: string;
}

export interface Guarantor {
  memberId: string;
  memberName: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface LoanRequest {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  repaidAmount: number;
  repaymentHistory: Repayment[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requestDate: string;
  // Approval Terms
  interestRate?: number; // Percentage
  durationMonths?: number;
  monthlyPayment?: number;
  totalInterest?: number;
  disbursedAmount?: number;
  // Guarantors
  guarantors?: Guarantor[];
  guarantorIds?: string[]; // For easier querying
}

export interface AppNotification {
  id: string;
  recipient: string; // 'ADMIN' or Member ID
  message: string;
  read: boolean;
  timestamp: string;
  type: 'info' | 'success' | 'warning';
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  GUEST = 'GUEST'
}

export interface UserContextType {
  role: UserRole;
  currentMember: Member | null;
  adminEmail: string | null;
  loginAdmin: (email: string) => void;
  loginMember: (member: Member) => void;
  logout: () => void;
}
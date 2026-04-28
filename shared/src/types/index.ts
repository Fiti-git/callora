// Shared TypeScript interfaces for all Prisma models.
// Mirror of `shared/src/prisma/schema.prisma`. Update both together.

export type Role = "ADMIN" | "MEMBER" | "VIEWER";
export type OrgStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
export type PlanTier = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type SubStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

export interface Organization {
  id: string;
  name: string;
  status: OrgStatus;
  aiCallerName: string;
  aiCallerCompany: string;
  aiCallerPhone: string;
  aiSystemPrompt: string | null;
  onboardingStep: string; // verify_email | choose_plan | setup_caller | complete
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string | null;
  role: Role;
  organizationId: string;
  emailVerified: boolean;
  verifyToken: string | null;
  verifyTokenExp: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  isSuperAdmin: boolean;
  twoFASecret: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: string;
  tier: PlanTier;
  name: string;
  stripePriceId: string;
  monthlyCallQuota: number;
  monthlyLeadQuota: number;
  seatLimit: number;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: SubStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  callsMade: number;
  leadsScraped: number;
  aiTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  actorType: string;
  actorId: string;
  organizationId: string | null;
  action: string;
  target: string | null;
  metadata: unknown | null;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  googleMapsKey: string | null;
  geminiKey: string | null;
  vapiKey: string | null;
  vapiPhoneId: string | null;
  organizationId: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: string;
  prompt: string | null;
  status: string;
  jobId: string | null;
  organizationId: string;
  maxRetryAttempts: number;
  retryDelayHours: number;
  followUpDelayDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  businessName: string;
  phone: string;
  address: string | null;
  email: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lead {
  id: string;
  businessName: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  interestScore: number;
  campaignId: string;
  organizationId: string;
  callAttempts: number;
  nextCallAt: Date | null;
  followUpAt: Date | null;
  contactId: string | null;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallLog {
  id: string;
  leadId: string;
  duration: number;
  status: string;
  transcript: string | null;
  summary: string | null;
  vapiCallId: string | null;
  cost: number | null;
  costBreakdown: unknown | null;
  createdAt: Date;
}

export interface Note {
  id: string;
  content: string;
  type: string;
  authorId: string;
  leadId: string | null;
  contactId: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  completed: boolean;
  completedAt: Date | null;
  assignedToId: string | null;
  leadId: string | null;
  contactId: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  probability: number | null;
  stage: string;
  closeDate: Date | null;
  notes: string | null;
  contactId: string;
  assignedToId: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Blacklist {
  id: string;
  phoneNumber: string;
  reason: string | null;
  organizationId: string;
  createdAt: Date;
}


Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  password: 'password',
  name: 'name',
  role: 'role',
  organizationId: 'organizationId',
  emailVerified: 'emailVerified',
  verifyToken: 'verifyToken',
  verifyTokenExp: 'verifyTokenExp',
  tokenVersion: 'tokenVersion',
  twoFASecret: 'twoFASecret',
  twoFAEnabled: 'twoFAEnabled',
  twoFARecoveryCodes: 'twoFARecoveryCodes',
  lastLoginAt: 'lastLoginAt',
  ssoProvider: 'ssoProvider',
  ssoSubject: 'ssoSubject',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PasswordResetTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  token: 'token',
  expiresAt: 'expiresAt',
  used: 'used',
  createdAt: 'createdAt'
};

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  status: 'status',
  aiCallerName: 'aiCallerName',
  aiCallerCompany: 'aiCallerCompany',
  aiCallerPhone: 'aiCallerPhone',
  aiSystemPrompt: 'aiSystemPrompt',
  onboardingStep: 'onboardingStep',
  vapiPhoneNumberId: 'vapiPhoneNumberId',
  vapiPhoneNumber: 'vapiPhoneNumber',
  gdprDeletedAt: 'gdprDeletedAt',
  zapierTriggerToken: 'zapierTriggerToken',
  billingMode: 'billingMode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PlatformUserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  isSuperAdmin: 'isSuperAdmin',
  twoFASecret: 'twoFASecret',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PlanScalarFieldEnum = {
  id: 'id',
  tier: 'tier',
  name: 'name',
  stripePriceId: 'stripePriceId',
  monthlyCallQuota: 'monthlyCallQuota',
  monthlyLeadQuota: 'monthlyLeadQuota',
  seatLimit: 'seatLimit',
  priceCents: 'priceCents',
  maxCallsPerMonth: 'maxCallsPerMonth',
  maxPlacesPerMonth: 'maxPlacesPerMonth',
  maxGeminiTokensPerMonth: 'maxGeminiTokensPerMonth',
  maxEmailsPerMonth: 'maxEmailsPerMonth',
  maxApiCallsPerMonth: 'maxApiCallsPerMonth',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SubscriptionScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  planId: 'planId',
  status: 'status',
  stripeCustomerId: 'stripeCustomerId',
  stripeSubscriptionId: 'stripeSubscriptionId',
  trialEndsAt: 'trialEndsAt',
  currentPeriodEnd: 'currentPeriodEnd',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UsageRecordScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  callsMade: 'callsMade',
  leadsScraped: 'leadsScraped',
  aiTokens: 'aiTokens',
  placesScraped: 'placesScraped',
  emailsSent: 'emailsSent',
  apiCallsThisMonth: 'apiCallsThisMonth',
  vapiSpendCents: 'vapiSpendCents',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  actorType: 'actorType',
  actorId: 'actorId',
  organizationId: 'organizationId',
  targetOrganizationId: 'targetOrganizationId',
  action: 'action',
  entity: 'entity',
  entityId: 'entityId',
  target: 'target',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.EmailLogScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  recipient: 'recipient',
  subject: 'subject',
  template: 'template',
  status: 'status',
  providerMessageId: 'providerMessageId',
  error: 'error',
  createdAt: 'createdAt'
};

exports.Prisma.ApiKeyScalarFieldEnum = {
  id: 'id',
  googleMapsKey: 'googleMapsKey',
  geminiKey: 'geminiKey',
  vapiKey: 'vapiKey',
  vapiPhoneId: 'vapiPhoneId',
  organizationId: 'organizationId'
};

exports.Prisma.CampaignScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  prompt: 'prompt',
  status: 'status',
  jobId: 'jobId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  maxRetryAttempts: 'maxRetryAttempts',
  retryDelayHours: 'retryDelayHours',
  followUpDelayDays: 'followUpDelayDays',
  deletedAt: 'deletedAt'
};

exports.Prisma.ContactScalarFieldEnum = {
  id: 'id',
  businessName: 'businessName',
  phone: 'phone',
  address: 'address',
  email: 'email',
  tags: 'tags',
  ownerId: 'ownerId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  businessName: 'businessName',
  address: 'address',
  phone: 'phone',
  notes: 'notes',
  status: 'status',
  interestScore: 'interestScore',
  campaignId: 'campaignId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  callAttempts: 'callAttempts',
  nextCallAt: 'nextCallAt',
  followUpAt: 'followUpAt',
  contactId: 'contactId',
  assignedToId: 'assignedToId',
  consentGiven: 'consentGiven',
  consentTimestamp: 'consentTimestamp',
  consentSource: 'consentSource',
  consentIpAddress: 'consentIpAddress',
  doNotCall: 'doNotCall',
  doNotCallReason: 'doNotCallReason',
  doNotCallAt: 'doNotCallAt',
  state: 'state',
  timezone: 'timezone',
  deletedAt: 'deletedAt'
};

exports.Prisma.CallLogScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  duration: 'duration',
  status: 'status',
  transcript: 'transcript',
  summary: 'summary',
  createdAt: 'createdAt',
  vapiCallId: 'vapiCallId',
  cost: 'cost',
  costBreakdown: 'costBreakdown',
  deletedAt: 'deletedAt'
};

exports.Prisma.NoteScalarFieldEnum = {
  id: 'id',
  content: 'content',
  type: 'type',
  authorId: 'authorId',
  leadId: 'leadId',
  contactId: 'contactId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  title: 'title',
  description: 'description',
  dueDate: 'dueDate',
  completed: 'completed',
  completedAt: 'completedAt',
  assignedToId: 'assignedToId',
  leadId: 'leadId',
  contactId: 'contactId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.DealScalarFieldEnum = {
  id: 'id',
  title: 'title',
  value: 'value',
  probability: 'probability',
  stage: 'stage',
  closeDate: 'closeDate',
  notes: 'notes',
  contactId: 'contactId',
  assignedToId: 'assignedToId',
  ownerId: 'ownerId',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.DealHistoryScalarFieldEnum = {
  id: 'id',
  dealId: 'dealId',
  organizationId: 'organizationId',
  fromStage: 'fromStage',
  toStage: 'toStage',
  changedById: 'changedById',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.DunningStateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  invoiceId: 'invoiceId',
  subscriptionId: 'subscriptionId',
  attempt: 'attempt',
  status: 'status',
  firstFailedAt: 'firstFailedAt',
  nextActionAt: 'nextActionAt',
  lastEmailSentAt: 'lastEmailSentAt',
  resolvedAt: 'resolvedAt',
  amountDueCents: 'amountDueCents',
  currency: 'currency',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StripeWebhookEventScalarFieldEnum = {
  id: 'id',
  type: 'type',
  livemode: 'livemode',
  receivedAt: 'receivedAt',
  processedAt: 'processedAt'
};

exports.Prisma.CallWindowConfigScalarFieldEnum = {
  id: 'id',
  state: 'state',
  allowedFrom: 'allowedFrom',
  allowedTo: 'allowedTo',
  timezone: 'timezone',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DNCEntryScalarFieldEnum = {
  id: 'id',
  phoneHash: 'phoneHash',
  organizationId: 'organizationId',
  source: 'source',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.EmailSuppressionScalarFieldEnum = {
  id: 'id',
  email: 'email',
  organizationId: 'organizationId',
  reason: 'reason',
  source: 'source',
  createdAt: 'createdAt'
};

exports.Prisma.ResendWebhookEventScalarFieldEnum = {
  id: 'id',
  type: 'type',
  receivedAt: 'receivedAt',
  processedAt: 'processedAt'
};

exports.Prisma.EmailCampaignScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  subject: 'subject',
  previewText: 'previewText',
  htmlBody: 'htmlBody',
  textBody: 'textBody',
  status: 'status',
  scheduledAt: 'scheduledAt',
  sentAt: 'sentAt',
  fromName: 'fromName',
  fromEmail: 'fromEmail',
  replyTo: 'replyTo',
  totalRecipients: 'totalRecipients',
  totalSent: 'totalSent',
  totalDelivered: 'totalDelivered',
  totalOpened: 'totalOpened',
  totalClicked: 'totalClicked',
  totalBounced: 'totalBounced',
  totalUnsubscribed: 'totalUnsubscribed',
  totalComplained: 'totalComplained',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.EmailRecipientListScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  description: 'description',
  memberCount: 'memberCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.EmailCampaignListScalarFieldEnum = {
  campaignId: 'campaignId',
  listId: 'listId'
};

exports.Prisma.EmailRecipientListMemberScalarFieldEnum = {
  id: 'id',
  listId: 'listId',
  contactId: 'contactId',
  email: 'email',
  source: 'source',
  subscribedAt: 'subscribedAt',
  unsubscribedAt: 'unsubscribedAt'
};

exports.Prisma.EmailSendScalarFieldEnum = {
  id: 'id',
  campaignId: 'campaignId',
  contactId: 'contactId',
  organizationId: 'organizationId',
  email: 'email',
  status: 'status',
  providerMessageId: 'providerMessageId',
  sentAt: 'sentAt',
  deliveredAt: 'deliveredAt',
  openedAt: 'openedAt',
  clickedAt: 'clickedAt',
  bouncedAt: 'bouncedAt',
  complainedAt: 'complainedAt',
  unsubscribedAt: 'unsubscribedAt',
  failedAt: 'failedAt',
  errorMessage: 'errorMessage',
  createdAt: 'createdAt'
};

exports.Prisma.EmailTemplateScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  subject: 'subject',
  htmlBody: 'htmlBody',
  textBody: 'textBody',
  category: 'category',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.EmailAutomationScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  trigger: 'trigger',
  active: 'active',
  sequence: 'sequence',
  stats: 'stats',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.EmailAutomationRunScalarFieldEnum = {
  id: 'id',
  automationId: 'automationId',
  organizationId: 'organizationId',
  contactId: 'contactId',
  triggeredAt: 'triggeredAt',
  currentStep: 'currentStep',
  status: 'status',
  context: 'context'
};

exports.Prisma.BlacklistScalarFieldEnum = {
  id: 'id',
  phoneNumber: 'phoneNumber',
  reason: 'reason',
  organizationId: 'organizationId',
  createdAt: 'createdAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TenantWebhookScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  url: 'url',
  events: 'events',
  secret: 'secret',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.WebhookDeliveryScalarFieldEnum = {
  id: 'id',
  webhookId: 'webhookId',
  organizationId: 'organizationId',
  event: 'event',
  payload: 'payload',
  status: 'status',
  responseCode: 'responseCode',
  responseBody: 'responseBody',
  attempts: 'attempts',
  lastAttemptAt: 'lastAttemptAt',
  createdAt: 'createdAt'
};

exports.Prisma.PublicApiKeyScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  name: 'name',
  keyHash: 'keyHash',
  prefix: 'prefix',
  scopes: 'scopes',
  lastUsedAt: 'lastUsedAt',
  createdById: 'createdById',
  createdAt: 'createdAt',
  revokedAt: 'revokedAt'
};

exports.Prisma.TenantProvisioningScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  status: 'status',
  vapiAssistantId: 'vapiAssistantId',
  vapiPhoneNumberId: 'vapiPhoneNumberId',
  vapiPhoneE164: 'vapiPhoneE164',
  stripeCustomerId: 'stripeCustomerId',
  defaultPaymentMethodId: 'defaultPaymentMethodId',
  failureReason: 'failureReason',
  steps: 'steps',
  provisionedAt: 'provisionedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CreditLedgerScalarFieldEnum = {
  id: 'id',
  organizationId: 'organizationId',
  balanceCents: 'balanceCents',
  lifetimeAddedCents: 'lifetimeAddedCents',
  lifetimeSpentCents: 'lifetimeSpentCents',
  autoRechargeEnabled: 'autoRechargeEnabled',
  autoRechargeThresholdCents: 'autoRechargeThresholdCents',
  autoRechargeAmountCents: 'autoRechargeAmountCents',
  lastAutoRechargeAt: 'lastAutoRechargeAt',
  lowBalanceAlertSentAt: 'lowBalanceAlertSentAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CreditTransactionScalarFieldEnum = {
  id: 'id',
  ledgerId: 'ledgerId',
  organizationId: 'organizationId',
  kind: 'kind',
  amountCents: 'amountCents',
  balanceAfterCents: 'balanceAfterCents',
  ref: 'ref',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.Role = exports.$Enums.Role = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
};

exports.OrgStatus = exports.$Enums.OrgStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
  PAUSED_NO_CREDIT: 'PAUSED_NO_CREDIT'
};

exports.BillingMode = exports.$Enums.BillingMode = {
  PAYG: 'PAYG',
  SUBSCRIPTION: 'SUBSCRIPTION',
  BYOK: 'BYOK'
};

exports.PlanTier = exports.$Enums.PlanTier = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE'
};

exports.SubStatus = exports.$Enums.SubStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  INCOMPLETE: 'INCOMPLETE'
};

exports.DunningStatus = exports.$Enums.DunningStatus = {
  ACTIVE: 'ACTIVE',
  RETRY_SCHEDULED: 'RETRY_SCHEDULED',
  WARNED: 'WARNED',
  SUSPENDED: 'SUSPENDED',
  RESOLVED: 'RESOLVED',
  CANCELED: 'CANCELED'
};

exports.EmailCampaignStatus = exports.$Enums.EmailCampaignStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED'
};

exports.EmailRecipientSource = exports.$Enums.EmailRecipientSource = {
  MANUAL: 'MANUAL',
  CSV_IMPORT: 'CSV_IMPORT',
  CAMPAIGN: 'CAMPAIGN',
  API: 'API'
};

exports.EmailSendStatus = exports.$Enums.EmailSendStatus = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  OPENED: 'OPENED',
  CLICKED: 'CLICKED',
  BOUNCED: 'BOUNCED',
  COMPLAINED: 'COMPLAINED',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  FAILED: 'FAILED'
};

exports.EmailAutomationTrigger = exports.$Enums.EmailAutomationTrigger = {
  LEAD_QUALIFIED: 'LEAD_QUALIFIED',
  DEAL_WON: 'DEAL_WON',
  CONTACT_CREATED: 'CONTACT_CREATED',
  CAMPAIGN_COMPLETE: 'CAMPAIGN_COMPLETE'
};

exports.WebhookEvent = exports.$Enums.WebhookEvent = {
  LEAD_QUALIFIED: 'LEAD_QUALIFIED',
  CALL_COMPLETED: 'CALL_COMPLETED',
  DEAL_WON: 'DEAL_WON',
  CAMPAIGN_COMPLETED: 'CAMPAIGN_COMPLETED',
  EMAIL_OPENED: 'EMAIL_OPENED',
  EMAIL_CLICKED: 'EMAIL_CLICKED'
};

exports.ProvisioningStatus = exports.$Enums.ProvisioningStatus = {
  PENDING: 'PENDING',
  PROVISIONING: 'PROVISIONING',
  READY: 'READY',
  FAILED: 'FAILED',
  SUSPENDED: 'SUSPENDED',
  DEPROVISIONED: 'DEPROVISIONED'
};

exports.Prisma.ModelName = {
  User: 'User',
  PasswordResetToken: 'PasswordResetToken',
  Organization: 'Organization',
  PlatformUser: 'PlatformUser',
  Plan: 'Plan',
  Subscription: 'Subscription',
  UsageRecord: 'UsageRecord',
  AuditLog: 'AuditLog',
  EmailLog: 'EmailLog',
  ApiKey: 'ApiKey',
  Campaign: 'Campaign',
  Contact: 'Contact',
  Lead: 'Lead',
  CallLog: 'CallLog',
  Note: 'Note',
  Task: 'Task',
  Deal: 'Deal',
  DealHistory: 'DealHistory',
  DunningState: 'DunningState',
  StripeWebhookEvent: 'StripeWebhookEvent',
  CallWindowConfig: 'CallWindowConfig',
  DNCEntry: 'DNCEntry',
  EmailSuppression: 'EmailSuppression',
  ResendWebhookEvent: 'ResendWebhookEvent',
  EmailCampaign: 'EmailCampaign',
  EmailRecipientList: 'EmailRecipientList',
  EmailCampaignList: 'EmailCampaignList',
  EmailRecipientListMember: 'EmailRecipientListMember',
  EmailSend: 'EmailSend',
  EmailTemplate: 'EmailTemplate',
  EmailAutomation: 'EmailAutomation',
  EmailAutomationRun: 'EmailAutomationRun',
  Blacklist: 'Blacklist',
  TenantWebhook: 'TenantWebhook',
  WebhookDelivery: 'WebhookDelivery',
  PublicApiKey: 'PublicApiKey',
  TenantProvisioning: 'TenantProvisioning',
  CreditLedger: 'CreditLedger',
  CreditTransaction: 'CreditTransaction'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)

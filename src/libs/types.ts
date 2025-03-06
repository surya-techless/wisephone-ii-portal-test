export type Token = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export type Groups = {
  resultValue: {
    total: number;
    groups: {
      groupName: string;
      groupId: string;
    }[];
  };
};

export type SubscriptionUpdated = {
  object: "event";
  id: string;
  data: {
    object: "subscription";
    id: string;
    metadata: Record<string, unknown>;
    cancellationDetails: null | Record<string, unknown>;
    currentPeriod: {
      number: number;
      start: string;
      end: string;
    };
    phoneNumber: string;
    plan: {
      object: "plan";
      id: string;
      metadata: Record<string, unknown>;
      allowances: {
        dataBytes: number;
        voiceSeconds: number | null;
        smsMessages: number | null;
      };
      coverage: {
        object: "coverage";
        id: string;
        countries: string[];
        name: string;
      };
      data: number;
      dataUnit: string;
      description: string;
      image: string;
      limits: {
        dataBytes: number;
        bandwidthBitsPerSecond: number | null;
        throttling: null | Record<string, unknown>;
      };
      name: string;
      price: {
        amount: number;
        currency: string;
      };
      provider: string;
      requirements: {
        address: string;
        device: string;
        "user.birthday": string;
        "user.fullName": string;
      };
      simTypes: string[];
      sms: number;
      smsUnit: string;
      status: string;
      validity: {
        minimumPeriods: number;
        type: string;
        unit: string;
        value: number;
      };
      voice: number;
      voiceUnit: string;
      createdAt: string;
    };
    porting: {
      object: "porting";
      id: string;
      accountNumber: string;
      accountPinExists: boolean;
      address: null | Record<string, unknown>;
      birthday: null | string;
      declinedAttempts: number;
      declinedCode: null | string;
      declinedMessage: null | string;
      donorProvider: {
        object: "serviceProvider";
        id: string;
        name: string;
        recipientProviders: string[];
      };
      donorProviderApproval: null | Record<string, unknown>;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      provider: string;
      recipientProvider: {
        object: "serviceProvider";
        id: string;
        name: string;
        recipientProviders: string[];
      };
      required: string[];
      status: string;
      subscription: string;
      user: string;
      canceledAt: string | null;
      completedAt: string | null;
      createdAt: string;
      expiredAt: string | null;
      lastDeclinedAt: string;
      lastRequestedAt: string;
    };
    sim: {
      object: "sim";
      id: string;
      metadata: Record<string, unknown>;
      iccid: string;
      provider: string;
      status: string;
      type: string;
      createdAt: string;
    };
    status: string;
    user: {
      object: "user";
      id: string;
      metadata: Record<string, unknown>;
      birthday: null | string;
      email: string;
      emailVerified: boolean;
      fullName: string;
      preferredLocale: string;
      createdAt: string;
    };
    activatedAt: string;
    canceledAt: string | null;
    createdAt: string;
    earliestEndAt: string;
    endedAt: string | null;
    firstUsageAt: string | null;
  };
  datacontenttype: string;
  previousData: {
    status: string;
    activatedAt: string | null;
  };
  project: string;
  source: string;
  specversion: string;
  time: string;
  type: string;
  version: string;
};

type SubscriptionChangeEvent = {
  object: "event";
  id: string;
  data: {
    object: "subscription";
    id: string;
    cancellationDetails: {
      cause: string;
      userReason: string;
    };
    currentPeriod: {
      number: number;
      start: string;
      end: string;
    };
    phoneNumber: string;
    plan: {
      object: "plan";
      id: string;
      allowances: {
        dataBytes: number;
        voiceSeconds: number;
        smsMessages: number;
      };
      coverage: {
        object: "coverage";
        id: string;
        countries: string[];
        name: string;
      };
      data: number;
      dataUnit: string;
      description: string;
      image: string;
      limits: {
        dataBytes: number;
        throttling: {
          thresholdBytes: number;
          bandwidthBitsPerSecond: number;
        };
      };
      name: string;
      price: {
        amount: number;
        currency: string;
      };
      provider: string;
      requirements: {
        address: string;
        device: string;
        "user.birthday": string;
        "user.fullName": string;
      };
      simTypes: string[];
      sms: number;
      smsUnit: string;
      status: string;
      validity: {
        minimumPeriods: number;
        type: string;
        unit: string;
        value: number;
      };
      voice: number;
      voiceUnit: string;
      createdAt: string;
    };
    porting: {
      object: "porting";
      id: string;
      accountNumber: string;
      accountPinExists: boolean;
      address: {
        city: string;
        country: string;
        line1: string;
        line2: string;
        postalCode: string;
        state: string;
      };
      birthday: string;
      declinedCode: string;
      declinedMessage: string;
      donorProvider: {
        object: "serviceProvider";
        id: string;
        name: string;
        recipientProviders: string[];
      };
      donorProviderApproval: boolean;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      provider: string;
      recipientProvider: {
        object: "serviceProvider";
        id: string;
        name: string;
        recipientProviders: string[];
      };
      required: string[];
      status: string;
      subscription: string;
      user: string;
      canceledAt: string;
      completedAt: string;
      createdAt: string;
      expiredAt: string;
      lastDeclinedAt: string;
      lastRequestedAt: string;
    };
    sim: {
      object: "sim";
      id: string;
      iccid: string;
      provider: string;
      status: string;
      type: string;
      createdAt: string;
    };
    status: string;
    user: {
      object: "user";
      id: string;
      birthday: string;
      email: string;
      emailVerified: boolean;
      fullName: string;
      preferredLocale: string;
      createdAt: string;
    };
    activatedAt: string;
    canceledAt: string;
    createdAt: string;
    earliestEndAt: string;
    endedAt: string;
    firstUsageAt: string;
  };
  datacontenttype: string;
  project: string;
  source: string;
  specversion: string;
  time: string;
  type: string;
  version: string;
};

export type UserDeviceInfo = {
  id: number;
  order: string;
  "Serial Number": string;
  "IMEI1 and IMEI2": string;
  Number: string;
  "SIM ICCID": string;
  Name: string;
  Email: string;
  "Techless Subscription": string | null;
  IMEI: string | null;
  Experience: { id: number; value: string; color: string } | null;
};

export type GigsPlan = "Pro + Unlimited" | "Healthy + 5GB" | "Minimal Plan + 1GB Package" | "Unpaid";

export type TallyFormResponse = {
  eventId: string;
  eventType: "FORM_RESPONSE";
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    respondentId: string;
    formId: string;
    formName: string;
    createdAt: string;
    fields: Array<{
      key: string;
      label: string;
      type: "INPUT_NUMBER" | "INPUT_PHONE_NUMBER" | "MULTIPLE_CHOICE" | "CHECKBOXES";
      value: string | number | boolean | string[];
      options?: Array<{
        id: string;
        text: string;
      }>;
    }>;
  };
};

export type UsersResult = {
  id: number;
  order: string;
  "Serial Number": string;
  "IMEI1 and IMEI2": string;
  Number: string;
  "SIM ICCID": string;
  Name: string;
  Email: string;
  "Techless Subscription": any;
  IMEI: string;
  Experience: { id: number; value: string; color: string } | null;
  DANGEROUSLY_SET_BYPASS_SUBSCRIPTION_VALIDATION: boolean;
};

export type UsersApiResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: UsersResult[];
};

export type DeviceList = {
  object: "list";
  items: Device[];
  moreItemsAfter: string | null;
  moreItemsBefore: string | null;
};

export type Device = {
  object: "device";
  id: string;
  metadata: Record<string, unknown>;
  imei: string;
  model: DeviceModel;
  name: string;
  sims: Sim[];
  user: User;
  createdAt: string;
};

export type DeviceModel = {
  object: "deviceModel";
  id: string;
  brand: string;
  name: string;
  simTypes: string[];
  type: string;
};

export type Sim = {
  object: "sim";
  id: string;
  metadata: Record<string, unknown>;
  iccid: string;
  provider: string;
  status: "active" | "inactive";
  type: string;
  createdAt: string;
};

export type User = {
  object: "user";
  id: string;
  metadata: Record<string, unknown>;
  birthday: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  preferredLocale: string;
  createdAt: string;
};

export type SubscriptionList = {
  object: "list";
  items: Subscription[];
  moreItemsAfter: string | null;
  moreItemsBefore: string | null;
};

export type Subscription = {
  object: "subscription";
  id: string;
  metadata: Record<string, unknown>;
  cancellationDetails: Record<string, unknown>;
  currentPeriod: Period;
  phoneNumber: string;
  plan: Plan;
  porting: Porting;
  sim: Sim;
  status: "pending" | "active" | "inactive" | "canceled";
  user: User;
  activatedAt: string;
  canceledAt: string;
  createdAt: string;
  earliestEndAt: string;
  endedAt: string;
  firstUsageAt: string;
};

export type Period = {
  number: number;
  start: string;
  end: string;
};

export type Plan = {
  object: "plan";
  id: string;
  metadata: Record<string, unknown>;
  allowances: Allowances;
  coverage: Coverage;
  data: number;
  dataUnit: string;
  description: string;
  image: string;
  limits: Limits;
  name: string;
  price: Price;
  provider: string;
  requirements: Requirements;
  simTypes: string[];
  sms: number;
  smsUnit: string;
  status: "available" | "unavailable";
  validity: Validity;
  voice: number;
  voiceUnit: string;
  createdAt: string;
};

export type Allowances = {
  dataBytes: number;
  voiceSeconds: number;
  smsMessages: number;
};

export type Coverage = {
  object: "coverage";
  id: string;
  countries: string[];
  name: string;
};

export type Limits = {
  dataBytes: number;
  bandwidthBitsPerSecond: number | null;
  throttling: Throttling;
};

export type Throttling = {
  thresholdBytes: number;
  bandwidthBitsPerSecond: number;
};

export type Price = {
  amount: number;
  currency: string;
};

export type Requirements = {
  address: string;
  device: string;
  "user.birthday": string;
  "user.fullName": string;
};

export type Validity = {
  minimumPeriods: number;
  type: string;
  unit: string;
  value: number;
};

export type Porting = {
  object: "porting";
  id: string;
  accountNumber: string;
  accountPinExists: boolean;
  address: Address;
  birthday: string;
  declinedAttempts: number;
  declinedCode: string;
  declinedMessage: string;
  donorProvider: ServiceProvider;
  donorProviderApproval: boolean;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  provider: string;
  recipientProvider: ServiceProvider;
  required: string[];
  status: "draft" | "submitted" | "completed" | "failed";
  subscription: string;
  user: string;
  canceledAt: string;
  completedAt: string;
  createdAt: string;
  expiredAt: string;
  lastDeclinedAt: string;
  lastRequestedAt: string;
};

export type Address = {
  city: string;
  country: string;
  line1: string;
  line2: string;
  postalCode: string;
  state: string;
};

export type ServiceProvider = {
  object: "serviceProvider";
  id: string;
  name: string;
  recipientProviders: string[];
};

export type Experience = "UNPAID" | "MINIMAL" | "HEALTHY" | "PRO";

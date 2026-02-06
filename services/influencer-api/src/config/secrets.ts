type Secrets = {
  AWS: {
    ACCESS_KEY_ID: string;
    SECRET_ACCESS_KEY: string;
    REGION: string;
    S3_BUCKET: string;
  };
  SENDGRID: {
    API_KEY: string;
    FROM_EMAIL: string;
  };
  FIREBASE: {
    PROJECT_ID: string;
    CLIENT_EMAIL: string;
    PRIVATE_KEY: string;
  };
};

const firebasePrivateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';

export const SECRETS: Secrets = {
  AWS: {
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
    REGION: process.env.AWS_REGION || 'us-east-1',
    S3_BUCKET: process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || '',
  },
  SENDGRID: {
    API_KEY: process.env.SENDGRID_API_KEY || '',
    FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || '',
  },
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
    PRIVATE_KEY: firebasePrivateKeyRaw.replace(/\\n/g, '\n'),
  },
};

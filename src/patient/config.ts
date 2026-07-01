export type PublicPatientConfig = {
  cognitoRegion: string;
  userPoolClientId: string;
  userPoolId: string;
};

export function publicPatientConfig(): PublicPatientConfig {
  return {
    cognitoRegion: import.meta.env.VITE_COGNITO_REGION ?? "",
    userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? "",
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  };
}

// In a real application, these would be managed securely, possibly via environment variables.
// For this revival project, we are defining them here as requested.
export const SECRET_CODES = {
    SETTINGS_ACCESS: '0000',
    ANALYTICS_ACCESS: '0000',
    // Add other secret codes as needed
};

// --- Dynamic Versioning System ---
// This function generates a dynamic version number to simulate updates.
// The patch number is based on the minutes passed since the beginning of the year,
// and the build ID is based on the current timestamp. This ensures the version
// changes with every code regeneration.
const generateDynamicVersion = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - startOfYear.getTime();
  const patchNumber = Math.floor(diff / 60000); // Unique patch number based on minutes since year start

  const buildDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const buildTime = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
  
  return {
    major: 2,
    minor: 1,
    patch: patchNumber,
    buildId: `${buildDate}-${buildTime}`
  };
};

export const SYSTEM_VERSION = generateDynamicVersion();


// --- New constants for the checkout component ---
export const CONTACT_INFO = {
    address: '123 ش التسعين, التجمع الخامس, القاهرة',
    phone: '01033254483'
};

// All mock promotions are disabled to prepare for production data.
export const promotions = [];
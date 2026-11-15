/**
 * Default Business Profile Template Generator
 */

function getDefaultOpeningHours() {
  const weekday = { open: '08:00', close: '17:00', closed: false };
  return {
    monday: { ...weekday },
    tuesday: { ...weekday },
    wednesday: { ...weekday },
    thursday: { ...weekday },
    friday: { ...weekday },
    saturday: { open: '09:00', close: '15:00', closed: false },
    sunday: { open: '09:00', close: '15:00', closed: true },
    alwaysOpen: false,
    notes: ''
  };
}

export function generateEmptyProfileTemplate(name = 'New Business Profile') {
  return {
    id: 'prof_' + Date.now().toString(36),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      businessName: '',
      tradingName: '',
      contactName: '',
      email: '',
      phone: '',
      mobile: '',
      website: '',
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      },
      services: [],
      openingHours: getDefaultOpeningHours(),
      descriptions: {
        short: '',
        full: '',
        tagline: ''
      },
      faqs: [],
      customFields: []
    }
  };
}

import { importConfiguration, exportConfiguration, detectFormat } from '../src/utils/importer.js';
import { getProfiles, getActiveProfile, getSettings } from '../src/services/storage.js';

const sampleLegacyJson = {
  "exportedAt": "2026-11-13T12:46:56.743Z",
  "extension": "2.5.2",
  "sync": {
    "memoryEnabled": true,
    "profileEnabled": true,
    "replaceAlreadyFilled": true,
    "replaceAlreadyFilledExplicit": false,
    "watchAllEnabled": false,
    "watchedSites": {
      "dracon.uk": {
        "enabled": false,
        "updatedAt": 1794573895766
      }
    }
  },
  "local": {
    "activeFlexibleProfileId": "7bdbe3af-ae0a-4038-93cd-a92734816ccb",
    "aiRateWindow": {
      "count": 1,
      "hourStart": 1794573300428
    },
    "byok-v2": {
      "ai_provider": "google",
      "enabled": true,
      "google_api_key": "AIzaSyDUMMY_MOCK_TEST_API_KEY_00000000000",
      "model": "gemini-flash-lite-latest"
    },
    "domainProfileMap": {},
    "fillCacheMap": {},
    "firstRunDismissals": [],
    "flexibleProfiles": [
      {
        "createdAt": "2026-11-12T13:08:27.198Z",
        "fields": {
          "0": {
            "category": "personal",
            "id": "fullName",
            "name": "Full Name",
            "type": "text",
            "value": "Alex Jordan Taylor"
          },
          "1": {
            "category": "personal",
            "id": "firstName",
            "name": "First Name",
            "type": "text",
            "value": "Alex"
          },
          "2": {
            "category": "personal",
            "id": "lastName",
            "name": "Last Name",
            "type": "text",
            "value": "Taylor"
          },
          "3": {
            "category": "personal",
            "id": "email",
            "name": "Email Address",
            "type": "text",
            "value": "contact@acmecleaningdemo.com"
          },
          "4": {
            "category": "personal",
            "id": "phone",
            "name": "Phone Number",
            "type": "text",
            "value": "+61400111222"
          },
          "5": {
            "category": "address",
            "id": "address",
            "name": "Address",
            "type": "textarea",
            "value": "100 Innovation Way Tech Park"
          },
          "6": {
            "category": "address",
            "id": "city",
            "name": "City",
            "type": "text",
            "value": "Perth"
          },
          "7": {
            "category": "address",
            "id": "country",
            "name": "Country",
            "type": "text",
            "value": "Australia"
          },
          "8": {
            "category": "web",
            "id": "portfolio",
            "name": "Portfolio/Website",
            "type": "text",
            "value": "https://acmecleaningdemo.com"
          },
          "9": {
            "id": "acf552b5-f6eb-4245-b104-8e8079903bb8",
            "name": "Services Provided",
            "type": "textarea",
            "value": "Office Cleaning, Medical Centre Cleaning, Warehouse Cleaning, Commercial Carpet Cleaning"
          },
          "10": {
            "id": "ac2330f5-b4bc-4b2a-9282-010931d0f5bb",
            "name": "FAQ Frequently asked questions",
            "type": "textarea",
            "value": "Q) What commercial cleaning services do you provide? A) We provide tailored commercial cleaning solutions across metropolitan areas.\n\nQ) How do rates work? A) Rates depend on facility size and schedule.\n\n"
          },
          "11": {
            "id": "bbc4816f-d7d5-45e0-932b-1b2722ec6c56",
            "name": "Description",
            "type": "text",
            "value": "Acme Cleaning Demo provides tailored commercial and office cleaning services for facilities and properties."
          },
          "12": {
            "id": "a5f7db0e-be77-43c8-aff6-cce05f4b530a",
            "name": "open hours",
            "type": "text",
            "value": ""
          }
        },
        "id": "99ccf4cf-d482-4056-9232-fe8926b8cf1c",
        "name": "Personal",
        "updatedAt": "2026-11-12T13:19:00.285Z"
      }
    ]
  }
};

async function runTests() {
  console.log('--- TEST 1: Detect Format ---');
  const format = detectFormat(sampleLegacyJson);
  console.log('Format detected:', format);
  if (format !== 'legacy-extension') {
    throw new Error('Expected legacy-extension format');
  }

  console.log('\n--- TEST 2: Import Legacy Configuration (Replace Mode) ---');
  const result = await importConfiguration(sampleLegacyJson, 'replace');
  console.log('Import result:', result);
  if (!result.success) {
    throw new Error('Import failed: ' + result.message);
  }

  const profiles = await getProfiles();
  console.log(`Loaded ${profiles.length} profile(s).`);
  const active = await getActiveProfile();
  console.log('Active Profile Name:', active?.name);
  console.log('Business Name:', active?.data?.businessName);
  console.log('Email:', active?.data?.email);
  console.log('Phone:', active?.data?.phone);
  console.log('Services Count:', active?.data?.services?.length);
  console.log('Services Sample:', active?.data?.services?.slice(0, 4));
  console.log('FAQs Count:', active?.data?.faqs?.length);
  console.log('First FAQ Question:', active?.data?.faqs?.[0]?.q);
  console.log('State inferred:', active?.data?.address?.state);

  if (active?.data?.email !== 'contact@acmecleaningdemo.com') {
    throw new Error('Email was not parsed properly');
  }
  if (!active?.data?.services || active.data.services.length !== 4) {
    throw new Error('Expected 4 services parsed, got: ' + active?.data?.services?.length);
  }
  if (!active?.data?.faqs || active.data.faqs.length < 2) {
    throw new Error('Expected at least 2 FAQs parsed');
  }

  console.log('\n--- TEST 3: Settings & API Key Ingestion ---');
  const settings = await getSettings();
  console.log('API key imported:', settings.geminiApiKey ? 'Yes (starts with ' + settings.geminiApiKey.substring(0, 6) + '...)' : 'No');
  if (!settings.geminiApiKey) {
    throw new Error('Expected API key to be imported from byok-v2');
  }

  console.log('\n--- TEST 4: Export Configuration ---');
  const exported = await exportConfiguration({ includeApiKey: true });
  console.log('Exported version:', exported.smartform_version);
  console.log('Exported profiles count:', exported.profiles.length);
  console.log('Exported active ID:', exported.activeProfileId);
  if (!exported.profiles || exported.profiles.length === 0) {
    throw new Error('Exported profile count is 0');
  }

  console.log('\n✅ All Importer and Storage Tests Passed Successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

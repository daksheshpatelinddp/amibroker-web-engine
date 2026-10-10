// Databases the app can use. To add a market later (BSE, NASDAQ...),
// upload its yearly parquet files to R2 and add one block here.
// Public address of the R2 bucket. Every database lives in its own folder inside it:
//   <R2_PUBLIC_URL>/nse/2023.parquet   <R2_PUBLIC_URL>/bse/2023.parquet   ...
const R2_PUBLIC_URL = 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev';

export const DATABASES = {
  nse: {
    id: 'nse',
    name: 'NSE',
    baseUrl: `${R2_PUBLIC_URL}/nse`,   // files: <baseUrl>/<year>.parquet
    firstYear: 2000,                   // years with no file on R2 are skipped automatically
    currency: 'INR',
  },
  // bse:    { id: 'bse',    name: 'BSE',    baseUrl: `${R2_PUBLIC_URL}/bse`,    firstYear: 2000, currency: 'INR' },
  // nasdaq: { id: 'nasdaq', name: 'NASDAQ', baseUrl: `${R2_PUBLIC_URL}/nasdaq`, firstYear: 2000, currency: 'USD' },
};

export const ACTIVE_DB = 'nse';

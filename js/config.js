// Databases the app can use. To add a market later (BSE, NASDAQ...),
// upload its yearly parquet files to R2 and add one block here.
export const DATABASES = {
  nse: {
    id: 'nse',
    name: 'NSE',
    baseUrl: 'https://pub-3a1a560916e2405a9787fd3d3d60d16e.r2.dev', // files: <baseUrl>/<year>.parquet
    firstYear: 2023,
    currency: 'INR',
  },
};

export const ACTIVE_DB = 'nse';

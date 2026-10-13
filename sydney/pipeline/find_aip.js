// Run in Chrome on https://www.aip.com.au/historical-ulp-and-diesel-tgp-data . Returns the latest TGP workbook URL; then navigate the tab to it to download.
[...document.querySelectorAll('a')].map(a=>a.href).find(h=>/AIP_TGP_Data_.*\.xlsx/i.test(h)) || null

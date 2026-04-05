// Seed data for universities — HBCUs, African universities, UK universities, and major US universities.
// The domain field is nullable; many institutions do not have a single authoritative email domain
// used for student verification, so it is omitted rather than guessed.

export interface UniversitySeed {
  name: string
  domain: string | null
  country: string
  city: string
}

export const universities: UniversitySeed[] = [
  // ──────────────────────────────────────────────
  // HBCUs (25)
  // ──────────────────────────────────────────────
  { name: 'Howard University',                     domain: 'howard.edu',     country: 'USA', city: 'Washington DC' },
  { name: 'Spelman College',                        domain: 'spelman.edu',    country: 'USA', city: 'Atlanta' },
  { name: 'Morehouse College',                      domain: 'morehouse.edu',  country: 'USA', city: 'Atlanta' },
  { name: 'Hampton University',                     domain: 'hamptonu.edu',   country: 'USA', city: 'Hampton' },
  { name: 'Florida A&M University',                 domain: 'famu.edu',       country: 'USA', city: 'Tallahassee' },
  { name: 'North Carolina A&T State University',    domain: 'ncat.edu',       country: 'USA', city: 'Greensboro' },
  { name: 'Morgan State University',                domain: 'morgan.edu',     country: 'USA', city: 'Baltimore' },
  { name: 'Tuskegee University',                    domain: 'tuskegee.edu',   country: 'USA', city: 'Tuskegee' },
  { name: 'Clark Atlanta University',               domain: 'cau.edu',        country: 'USA', city: 'Atlanta' },
  { name: 'Tennessee State University',             domain: 'tnstate.edu',    country: 'USA', city: 'Nashville' },
  { name: 'Bethune-Cookman University',             domain: 'cookman.edu',    country: 'USA', city: 'Daytona Beach' },
  { name: 'Delaware State University',              domain: 'desu.edu',       country: 'USA', city: 'Dover' },
  { name: 'Grambling State University',             domain: 'gram.edu',       country: 'USA', city: 'Grambling' },
  { name: 'Jackson State University',               domain: 'jsums.edu',      country: 'USA', city: 'Jackson' },
  { name: 'Southern University and A&M College',   domain: 'subr.edu',       country: 'USA', city: 'Baton Rouge' },
  { name: 'Texas Southern University',              domain: 'tsu.edu',        country: 'USA', city: 'Houston' },
  { name: 'Prairie View A&M University',            domain: 'pvamu.edu',      country: 'USA', city: 'Prairie View' },
  { name: 'Virginia State University',              domain: 'vsu.edu',        country: 'USA', city: 'Petersburg' },
  { name: 'Winston-Salem State University',         domain: 'wssu.edu',       country: 'USA', city: 'Winston-Salem' },
  { name: 'Fisk University',                        domain: 'fisk.edu',       country: 'USA', city: 'Nashville' },
  { name: 'Dillard University',                     domain: 'dillard.edu',    country: 'USA', city: 'New Orleans' },
  { name: 'Xavier University of Louisiana',         domain: 'xula.edu',       country: 'USA', city: 'New Orleans' },
  { name: 'Meharry Medical College',                domain: 'mmc.edu',        country: 'USA', city: 'Nashville' },
  { name: 'Bowie State University',                 domain: 'bowiestate.edu', country: 'USA', city: 'Bowie' },
  { name: 'Coppin State University',                domain: 'coppin.edu',     country: 'USA', city: 'Baltimore' },

  // ──────────────────────────────────────────────
  // African Universities (20)
  // ──────────────────────────────────────────────
  { name: 'University of Ghana',                    domain: 'ug.edu.gh',      country: 'Ghana',        city: 'Accra' },
  { name: 'University of Lagos',                    domain: 'unilag.edu.ng',  country: 'Nigeria',      city: 'Lagos' },
  { name: 'University of Cape Town',                domain: 'uct.ac.za',      country: 'South Africa', city: 'Cape Town' },
  { name: 'University of Nairobi',                  domain: 'uonbi.ac.ke',    country: 'Kenya',        city: 'Nairobi' },
  { name: 'Makerere University',                    domain: 'mak.ac.ug',      country: 'Uganda',       city: 'Kampala' },
  { name: 'University of Ibadan',                   domain: 'ui.edu.ng',      country: 'Nigeria',      city: 'Ibadan' },
  { name: 'Cairo University',                       domain: 'cu.edu.eg',      country: 'Egypt',        city: 'Cairo' },
  { name: 'University of Pretoria',                 domain: 'up.ac.za',       country: 'South Africa', city: 'Pretoria' },
  { name: 'Stellenbosch University',                domain: 'sun.ac.za',      country: 'South Africa', city: 'Stellenbosch' },
  { name: 'Addis Ababa University',                 domain: 'aau.edu.et',     country: 'Ethiopia',     city: 'Addis Ababa' },
  { name: 'University of Dar es Salaam',            domain: 'udsm.ac.tz',     country: 'Tanzania',     city: 'Dar es Salaam' },
  { name: 'University of Zambia',                   domain: 'unza.zm',        country: 'Zambia',       city: 'Lusaka' },
  { name: 'University of Zimbabwe',                 domain: 'uz.ac.zw',       country: 'Zimbabwe',     city: 'Harare' },
  { name: 'Cheikh Anta Diop University',            domain: 'ucad.edu.sn',    country: 'Senegal',      city: 'Dakar' },
  { name: 'Kwame Nkrumah University of Science and Technology', domain: 'knust.edu.gh', country: 'Ghana', city: 'Kumasi' },
  { name: 'University of Khartoum',                 domain: 'uofk.edu',       country: 'Sudan',        city: 'Khartoum' },
  { name: 'Obafemi Awolowo University',             domain: 'oauife.edu.ng',  country: 'Nigeria',      city: 'Ile-Ife' },
  { name: 'University of Benin',                    domain: 'uniben.edu.ng',  country: 'Nigeria',      city: 'Benin City' },
  { name: 'Ahmadu Bello University',                domain: 'abu.edu.ng',     country: 'Nigeria',      city: 'Zaria' },
  { name: 'University of Yaoundé I',                domain: null,             country: 'Cameroon',     city: 'Yaoundé' },

  // ──────────────────────────────────────────────
  // UK Universities (6)
  // ──────────────────────────────────────────────
  { name: 'University College London',              domain: 'ucl.ac.uk',         country: 'United Kingdom', city: 'London' },
  { name: 'London School of Economics',             domain: 'lse.ac.uk',         country: 'United Kingdom', city: 'London' },
  { name: "King's College London",                  domain: 'kcl.ac.uk',         country: 'United Kingdom', city: 'London' },
  { name: 'University of Manchester',               domain: 'manchester.ac.uk',  country: 'United Kingdom', city: 'Manchester' },
  { name: 'University of Birmingham',               domain: 'bham.ac.uk',        country: 'United Kingdom', city: 'Birmingham' },
  { name: 'University of Edinburgh',                domain: 'ed.ac.uk',          country: 'United Kingdom', city: 'Edinburgh' },

  // ──────────────────────────────────────────────
  // Major US Universities — non-HBCU (6)
  // ──────────────────────────────────────────────
  { name: 'University of California, Los Angeles',  domain: 'ucla.edu',       country: 'USA', city: 'Los Angeles' },
  { name: 'University of Michigan',                 domain: 'umich.edu',      country: 'USA', city: 'Ann Arbor' },
  { name: 'Columbia University',                    domain: 'columbia.edu',   country: 'USA', city: 'New York' },
  { name: 'New York University',                    domain: 'nyu.edu',        country: 'USA', city: 'New York' },
  { name: 'University of Southern California',      domain: 'usc.edu',        country: 'USA', city: 'Los Angeles' },
  { name: 'Georgia State University',               domain: 'gsu.edu',        country: 'USA', city: 'Atlanta' },
]

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function getPostcodePrefix(postcode: string | null | undefined): string {
  const normalized = String(postcode || '').trim().toUpperCase()
  if (!normalized) return ''
  const match = normalized.match(/^[A-Z]{1,2}/)
  return match ? match[0] : ''
}

function isPrefixIn(prefix: string, prefixes: string[]): boolean {
  return prefix.length > 0 && prefixes.includes(prefix)
}

export function getStoreRegionGroup(
  region: string | null | undefined,
  storeName?: string | null,
  city?: string | null,
  postcode?: string | null
): string {
  const regionText = normalize(region)
  const nameText = normalize(storeName)
  const cityText = normalize(city)
  const postcodeText = normalize(postcode)
  const combined = `${regionText} ${nameText} ${cityText} ${postcodeText}`.trim()
  const postcodePrefix = getPostcodePrefix(postcode)

  if (!combined) return 'Other'

  if (includesAny(combined, ['scotland', 'glasgow', 'edinburgh', 'dundee', 'stirling', 'inverness', 'ayr', 'dumfries', 'livingston', 'kilbride', 'gretna'])) {
    return 'Scotland'
  }

  if (includesAny(combined, ['newcastle', 'sunderland', 'gateshead', 'hartlepool', 'middlesbrough', 'northumberland', 'tyne and wear', 'tyre and wear', 'durham', 'cramlington', 'washington'])) {
    return 'North East'
  }

  if (
    includesAny(combined, ['north west', 'lancashire', 'cheshire', 'cumbria', 'wigan', 'preston', 'blackburn', 'blackpool', 'fleetwood', 'chorley', 'lancaster', 'skelmersdale', 'warrington', 'widnes']) ||
    isPrefixIn(postcodePrefix, ['BB', 'BL', 'CA', 'CH', 'CW', 'FY', 'L', 'LA', 'M', 'OL', 'PR', 'SK', 'WA', 'WN'])
  ) {
    return 'North West'
  }

  if (includesAny(combined, ['manchester', 'salford', 'trafford', 'rochdale', 'oldham', 'stockport', 'ashton under lyne', 'bury'])) {
    return 'Manchester'
  }

  if (includesAny(combined, ['liverpool', 'merseyside', 'birkenhead', 'bootle', 'huyton', 'st helens', 'runcorn', 'southport'])) {
    return 'Liverpool'
  }

  if (includesAny(combined, ['birmingham', 'solihull', 'walsall', 'perry barr', 'bull ring', 'sutton coldfield', 'halesowen'])) {
    return 'Birmingham'
  }

  if (includesAny(combined, ['yorkshire', 'leeds', 'bradford', 'wakefield', 'huddersfield', 'halifax', 'sheffield', 'barnsley', 'doncaster', 'harrogate', 'scarborough', 'hull', 'keighley'])) {
    return 'Yorkshire'
  }

  if (includesAny(combined, ['wales', 'cardiff', 'swansea', 'newport', 'wrexham', 'merthyr', 'llanelli', 'cwmbran', 'rhyl', 'port talbot', 'llandudno', 'clwyd', 'flintshire', 'torfaen', 'carmarthenshire'])) {
    return 'Wales'
  }

  if (includesAny(combined, ['london', 'wembley', 'walthamstow', 'croydon', 'stratford', 'canary wharf', 'hammersmith', 'oxford street', 'kingston', 'wandsworth', 'lewisham', 'harrow', 'ilford', 'bromley', 'bexley', 'greenwich'])) {
    return 'London'
  }

  if (includesAny(combined, ['west midlands', 'coventry', 'wolverhampton', 'dudley', 'staffordshire', 'tamworth', 'telford', 'shropshire', 'warwickshire', 'worcestershire', 'stoke'])) {
    return 'West Midlands'
  }

  if (includesAny(combined, ['east midlands', 'nottingham', 'leicester', 'derby', 'lincolnshire', 'northampton', 'nuneaton', 'leicestershire', 'derbyshire', 'rugby', 'spalding', 'lincoln'])) {
    return 'East Midlands'
  }

  if (includesAny(combined, ['kent', 'surrey', 'sussex', 'hampshire', 'berkshire', 'oxfordshire', 'portsmouth', 'southampton', 'brighton', 'maidstone', 'ashford', 'fareham', 'newbury', 'didcot', 'staines', 'guildford', 'redhill', 'epsom'])) {
    return 'South East'
  }

  if (includesAny(combined, ['devon', 'cornwall', 'somerset', 'dorset', 'bristol', 'plymouth', 'exeter', 'taunton', 'truro', 'gloucester', 'poole', 'bournemouth', 'barnstaple', 'bideford'])) {
    return 'South West'
  }

  if (includesAny(combined, ['essex', 'hertfordshire', 'cambridgeshire', 'norfolk', 'suffolk', 'luton', 'watford', 'chelmsford', 'colchester', 'romford', 'southend', 'norwich', 'cambridge', 'bedford', 'milton keynes', 'buckinghamshire'])) {
    return 'East of England'
  }

  if (includesAny(combined, ['dublin', 'belfast'])) {
    return 'Ireland'
  }

  if (isPrefixIn(postcodePrefix, ['AB', 'DD', 'DG', 'EH', 'FK', 'G', 'IV', 'KA', 'KY', 'ML', 'PA', 'PH', 'TD', 'KW'])) return 'Scotland'
  if (isPrefixIn(postcodePrefix, ['NE', 'DH', 'SR', 'TS', 'DL'])) return 'North East'
  if (isPrefixIn(postcodePrefix, ['BD', 'DN', 'HD', 'HG', 'HU', 'HX', 'LS', 'S', 'WF', 'YO'])) return 'Yorkshire'
  if (isPrefixIn(postcodePrefix, ['CF', 'LL', 'NP', 'SA'])) return 'Wales'
  if (isPrefixIn(postcodePrefix, ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'CR', 'HA', 'IG', 'RM', 'UB', 'EN', 'TW'])) return 'London'
  if (isPrefixIn(postcodePrefix, ['B', 'CV', 'DY', 'ST', 'TF', 'WS', 'WV'])) return 'West Midlands'
  if (isPrefixIn(postcodePrefix, ['DE', 'LE', 'LN', 'NG', 'NN', 'PE'])) return 'East Midlands'
  if (isPrefixIn(postcodePrefix, ['BN', 'BR', 'CT', 'DA', 'GU', 'HP', 'KT', 'ME', 'MK', 'OX', 'PO', 'RG', 'RH', 'SL', 'SM', 'SO', 'TN'])) return 'South East'
  if (isPrefixIn(postcodePrefix, ['BA', 'BH', 'BS', 'DT', 'EX', 'GL', 'PL', 'SN', 'TA', 'TQ', 'TR'])) return 'South West'
  if (isPrefixIn(postcodePrefix, ['AL', 'CB', 'CM', 'CO', 'IP', 'LU', 'NR', 'SG', 'SS', 'WD'])) return 'East of England'
  if (isPrefixIn(postcodePrefix, ['BT', 'D'])) return 'Ireland'

  return 'Other'
}

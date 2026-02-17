-- Merge FAHS-imported stores into actual fa_stores
-- Redirects incidents and claims to real stores, then removes FAHS duplicates.
-- Mapping: FAHS store_name -> real store (by store_name match)

-- 1. Update fa_incidents: FAHS store_id -> real store_id
UPDATE fa_incidents SET store_id = '4c73d354-2e23-48cb-876f-b75e2b672705' WHERE store_id = '3c5391bf-e650-4e02-a782-db9e705b3cec';  -- Bullring -> Bull ring new
UPDATE fa_incidents SET store_id = '48b65674-42ba-4532-b331-875c8651f12d' WHERE store_id = 'ef7b512b-068e-4165-8794-4192fc5b172e';  -- Glasgow -> Glasgow Argyle
UPDATE fa_incidents SET store_id = '4071478f-ef5c-45e4-95d0-2f31f3539251' WHERE store_id = 'b39cf1f0-dadc-4ac1-899f-9ed18dfc70ef';  -- Lakeside -> Lakeside New
UPDATE fa_incidents SET store_id = 'd15404f9-37c5-49fb-af51-0a75c11f9fc1' WHERE store_id = '00609764-d1e4-45c5-a12c-2b27a6caa5ae';  -- M3 -> Heywood
UPDATE fa_incidents SET store_id = '4334a472-66fe-45db-965a-5ef8dcaffbbc' WHERE store_id = '3c853b9b-4662-48bd-bb06-26824c0cb257';  -- Manchester Arndale -> Manchester
UPDATE fa_incidents SET store_id = '5c7464e3-13fb-4ba9-b02b-bb0615dcf055' WHERE store_id = '65ff8c38-36e8-4492-ba0e-ce6b8c0c9269';  -- Manchester Womens -> Manchester Women's
UPDATE fa_incidents SET store_id = '81bbeec0-c534-4a6d-8ea1-9c624aeecaa4' WHERE store_id = '34586b8e-93c3-4443-a097-fe0bc5762ebb';  -- Metro Centre -> Metro New
UPDATE fa_incidents SET store_id = '7c8d8486-a5c7-4617-940e-7233eff86f6a' WHERE store_id = 'bd659554-3a2e-45ac-8163-bc7395b27ca4';  -- Nottingham -> Nottingham Clumber St.
UPDATE fa_incidents SET store_id = '03cfa587-fe7e-489a-87b1-fd44c660adc6' WHERE store_id = '321a37f9-01ea-4fed-92c6-e349648d3885';  -- P62 -> Middleton
UPDATE fa_incidents SET store_id = '5dfe7386-e3ce-4791-a46e-ca9f94177a72' WHERE store_id = 'd2ea363d-02ea-4359-b904-ab14368133d6';  -- Watford -> Watford New Store
UPDATE fa_incidents SET store_id = '9783f271-811d-452f-9e04-32c4ef4a067a' WHERE store_id = '7decec21-1a6c-4116-b727-a12b59f1c0f8';  -- West Brom -> West Bromwich

-- 2. Update fa_claims
UPDATE fa_claims SET store_id = 'd15404f9-37c5-49fb-af51-0a75c11f9fc1' WHERE store_id = '00609764-d1e4-45c5-a12c-2b27a6caa5ae';  -- M3 -> Heywood
UPDATE fa_claims SET store_id = '03cfa587-fe7e-489a-87b1-fd44c660adc6' WHERE store_id = '321a37f9-01ea-4fed-92c6-e349648d3885';  -- P62 -> Middleton

-- 3. Delete FAHS stores (incidents and claims now point to real stores)
DELETE FROM fa_stores WHERE store_code LIKE 'FAHS-%';

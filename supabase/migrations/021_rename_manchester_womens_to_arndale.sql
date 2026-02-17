-- Manchester Women's is now Manchester Arndale
UPDATE fa_stores 
SET store_name = 'Manchester Arndale' 
WHERE store_name = 'Manchester Women''s';

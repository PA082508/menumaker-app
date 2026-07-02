-- Official menu form: optionally force which credited component is a combo's
-- "primary" (the row that prints the dish name), overriding the default
-- M&A > Grain > Vegetable > Fruit > Milk priority. NULL = use the default.
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-02.
alter table menumaker.recipes add column if not exists menu_form_primary_component text;
comment on column menumaker.recipes.menu_form_primary_component is
  'Official menu form combo override: component slug to use as the primary (name) row; NULL = default priority.';

-- Pea Soup with Oats is a legume soup — its name belongs in the Vegetable row.
-- (Recipe also re-credited M&A -> Vegetable in recipe_components the same day.)
update menumaker.recipes
set menu_form_primary_component = 'vegetable'
where id = 'b0000001-0000-0000-0000-000000000005';

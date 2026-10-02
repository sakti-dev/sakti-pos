# Spec Delta: recipes

## ADDED Requirements

### Requirement: Recipe Data Model

The system SHALL store recipes as merchant-scoped link rows between a product and an ingredient, each carrying the quantity of the ingredient consumed per one unit of the product sold (`qtyPerUnit`, fractional allowed). A product MAY have zero or more recipe links; each (product, ingredient) pair SHALL be unique.

#### Scenario: Linking a product to three bahan

- **WHEN** the user saves a product with recipe links of Biji Kopi 0.25 kg, Susu UHT 150 ml, and Cup 1 pcs
- **THEN** three link rows persist with those per-unit quantities and sync across outlets of the merchant

#### Scenario: Updating a quantity

- **WHEN** the user changes Biji Kopi from 0.25 to 0.3 per unit and saves
- **THEN** the link row updates in place; no duplicate rows appear

#### Scenario: Removing a link

- **WHEN** the user removes an ingredient from a product's recipe
- **THEN** the link is soft-deleted and the ingredient's balance stops being affected by future sales of that product
- **AND** historical sales and stock events remain unchanged

### Requirement: Recipe Editing Surface

The product form SHALL include a Bahan Baku (recipe) section listing selected ingredients with per-unit quantity inputs in each bahan's own unit, plus an add flow (search + selection sheet) over the active ingredient catalog. The section SHALL indicate when a linked bahan has been deactivated. An empty recipe SHALL be valid.

#### Scenario: Add flow shows only active bahan

- **WHEN** the user opens the Tambah Bahan sheet
- **THEN** it lists active ingredients at the merchant, searchable by name, each showing its unit

#### Scenario: Deactivated bahan in an existing recipe

- **WHEN** a recipe row references a bahan that was later deactivated
- **THEN** the product form shows the row with a warning state instead of silently dropping it

### Requirement: Recipes Are Product-Level

Recipes SHALL attach to products, not to modifier options. Modifier selections SHALL NOT change ingredient deduction amounts.

#### Scenario: Modifier does not alter consumption

- **WHEN** a line sells a product with an "Extra Shot" modifier option and a recipe of 0.25 kg kopi
- **THEN** the deduction uses the recipe quantity only

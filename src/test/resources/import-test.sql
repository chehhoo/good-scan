-- ─── Test seed data ──────────────────────────────────────────────────────────
-- Loaded by %test profile (H2 in-memory, MySQL mode).
-- Tables are created by Hibernate drop-and-create from entity definitions.
-- CamelCaseToUnderscoresNamingStrategy applies to @Column(name) annotations,
-- so PascalCase names in @Column become snake_case in H2 DDL.
-- FK order: event → church → profile, meal → register → register_meal, register_profile, meal_tracker

-- Event id=89 (matches meal.event.id config property)
INSERT INTO event (id, uid, name_cn, name_en, description_cn, description_en,
                   stripe_descriptor, flyer, link, location, address, city, state, zipcode,
                   deadline, start_date, end_date, capacity, option, notify_email,
                   status, online_payment, church_sponsor, allow_guest, has_group, use_zoom)
VALUES (89, 'EVT89000', 'Test', 'Test Event', '', '', '', '', '', '', '', '', '', '',
        '2026-07-01', '2026-07-10', '2026-07-12', 0, 0, '', 1, 0, 0, 0, 0, 0);

-- Church
INSERT INTO church (id, acronym, name_cn, name_en)
VALUES (1, 'TESTCH', '', 'Test Church');

-- Profiles: 1001 is registered, 1002 has no registration
INSERT INTO profile (id, uid, household_id, first_name, last_name, church_id)
VALUES (1001, 'ABC001', 1, 'John', 'Doe', 1);

INSERT INTO profile (id, uid, household_id, first_name, last_name, church_id)
VALUES (1002, 'ABC002', 2, 'Jane', 'Smith', 1);

-- Meals at location 1 (all on 2026-07-11)
--   type: 1=BREAKFAST, 2=LUNCH, 3=DINNER
INSERT INTO meal (id, uid, event_id, date, start_time, end_time, deadline, type, location, name, price)
VALUES (1, 'MEAL0001', 89, '2026-07-11', '07:00:00', '09:00:00', '2026-07-01 00:00:00', 1, 1, 'Breakfast Day 1', 10.00);

INSERT INTO meal (id, uid, event_id, date, start_time, end_time, deadline, type, location, name, price)
VALUES (2, 'MEAL0002', 89, '2026-07-11', '12:00:00', '13:30:00', '2026-07-01 00:00:00', 2, 1, 'Lunch Day 1', 12.00);

INSERT INTO meal (id, uid, event_id, date, start_time, end_time, deadline, type, location, name, price)
VALUES (3, 'MEAL0003', 89, '2026-07-11', '18:00:00', '20:00:00', '2026-07-01 00:00:00', 3, 1, 'Dinner Day 1', 15.00);

-- Register for household 1, event 89
INSERT INTO register (id, uid, household_id, event_id, profile_id, created_on, last_update, status, price_model, adult, total_people, stripe_customer_id, note)
VALUES (1, 'REGX0001', 1, 89, '[1001]', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 3, 0, 2, 2, '', '');

-- Meal orders: 2 breakfasts, 1 lunch, 1 dinner
INSERT INTO register_meal (id, register_id, meal_id, qty) VALUES (1, 1, 1, 2);
INSERT INTO register_meal (id, register_id, meal_id, qty) VALUES (2, 1, 2, 1);
INSERT INTO register_meal (id, register_id, meal_id, qty) VALUES (3, 1, 3, 1);

-- Register-profile link
INSERT INTO register_profile (id, profile_id, register_id) VALUES (1, 1001, 1);

-- Pre-existing pickup: 1 of 2 breakfasts already taken
INSERT INTO meal_tracker (id, last_modified, meal_id, person_id, uid, register_id, household_id, location_id, remark)
VALUES (1, '2026-07-11 07:30:00', 1, 1001, 'ABC001', 1, 1, 1, 'John Doe');

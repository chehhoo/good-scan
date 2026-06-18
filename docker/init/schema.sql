-- Good Scan Database Schema
-- Shared with good-camp (good-camp manages the authoritative schema).
-- This file is for local dev spin-up only.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `meal_tracker`;
DROP TABLE IF EXISTS `register_profile`;
DROP TABLE IF EXISTS `register_meal`;
DROP TABLE IF EXISTS `register`;
DROP TABLE IF EXISTS `meal`;
DROP TABLE IF EXISTS `profile`;
DROP TABLE IF EXISTS `event`;
DROP TABLE IF EXISTS `church`;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── church ───────────────────────────────────────────────────────────────────
CREATE TABLE `church` (
  `id`       int(10) unsigned NOT NULL AUTO_INCREMENT,
  `acronym`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_cn`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `alias`    varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `city`     varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `state`    varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `zipcode`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `region`   varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `website`  varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `admin_id` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── event ────────────────────────────────────────────────────────────────────
CREATE TABLE `event` (
  `id`                      int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uid`                     char(10)         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_cn`                 varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `name_en`                 varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `description_cn`          varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `description_en`          varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `stripe_descriptor`       char(16)         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `flyer`                   varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `link`                    varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `location`                varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `address`                 varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `city`                    varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `state`                   varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `zipcode`                 varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `deadline`                date             NOT NULL,
  `start_date`              date             NOT NULL,
  `end_date`                date             NOT NULL,
  `capacity`                smallint(5) unsigned NOT NULL DEFAULT 0,
  `option`                  smallint(5) unsigned NOT NULL DEFAULT 0,
  `notify_email`            varchar(255)     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status`                  tinyint(3) unsigned NOT NULL DEFAULT 1,
  `contact_info`            varchar(255)     DEFAULT NULL,
  `closed_message`          varchar(255)     DEFAULT NULL,
  `online_payment`          tinyint(3) unsigned NOT NULL DEFAULT 0,
  `church_sponsor`          tinyint(3) unsigned NOT NULL DEFAULT 0,
  `allow_guest`             tinyint(3) unsigned NOT NULL DEFAULT 0,
  `has_group`               tinyint(3) unsigned NOT NULL DEFAULT 0,
  `use_zoom`                tinyint(3) unsigned NOT NULL DEFAULT 0,
  `group_leader_option_id`  int(10)          DEFAULT NULL,
  `group_leader_option_value` int(10)        DEFAULT NULL,
  `join_email_date`         date             DEFAULT NULL,
  `admin_user_id`           varchar(255)     DEFAULT NULL,
  `event_category_id`       int(10)          DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── profile ──────────────────────────────────────────────────────────────────
CREATE TABLE `profile` (
  `id`            int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uid`           char(10)         NOT NULL,
  `user_id`       int(10) unsigned DEFAULT NULL,
  `household_id`  int(10) unsigned DEFAULT NULL,
  `added_by`      int(10) unsigned DEFAULT NULL,
  `cn_name`       varchar(255)     NOT NULL DEFAULT '',
  `first_name`    varchar(255)     NOT NULL DEFAULT '',
  `last_name`     varchar(255)     NOT NULL DEFAULT '',
  `sex`           enum('M','F')    DEFAULT NULL,
  `birth`         year(4)          NOT NULL,
  `phone`         varchar(255)     NOT NULL DEFAULT '',
  `phone_code`    int(10)          DEFAULT NULL,
  `phone_verified` tinyint(3) unsigned DEFAULT NULL,
  `sms_optout`    tinyint(3) unsigned DEFAULT NULL,
  `wechat`        varchar(255)     NOT NULL DEFAULT '',
  `address`       varchar(255)     NOT NULL DEFAULT '',
  `address2`      varchar(255)     NOT NULL DEFAULT '',
  `city`          varchar(255)     NOT NULL DEFAULT '',
  `state`         varchar(255)     NOT NULL DEFAULT '',
  `country`       varchar(255)     NOT NULL DEFAULT '',
  `zipcode`       varchar(255)     NOT NULL DEFAULT '',
  `believe`       year(4)          DEFAULT NULL,
  `church_id`     int(10) unsigned DEFAULT NULL,
  `serve`         tinyint(3) unsigned DEFAULT NULL,
  `status`        tinyint(3) unsigned DEFAULT NULL,
  `note`          varchar(255)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── meal ─────────────────────────────────────────────────────────────────────
CREATE TABLE `meal` (
  `id`         int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uid`        char(10)         NOT NULL,
  `event_id`   int(10) unsigned NOT NULL,
  `date`       date             NOT NULL,
  `start_time` time             NOT NULL,
  `end_time`   time             NOT NULL,
  `deadline`   datetime         NOT NULL,
  `type`       tinyint(3) unsigned NOT NULL COMMENT '0=Other;1=Breakfast;2=Lunch;3=Dinner;4=Snack',
  `location`   tinyint(3) unsigned NOT NULL COMMENT '0=Other;1=CCCC;2=GRACE',
  `name`       varchar(255)     NOT NULL,
  `price`      decimal(13,4) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`),
  KEY `event_id` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── register ─────────────────────────────────────────────────────────────────
CREATE TABLE `register` (
  `id`                 int(10) unsigned NOT NULL AUTO_INCREMENT,
  `uid`                char(10)         NOT NULL,
  `household_id`       int(10) unsigned NOT NULL,
  `event_id`           int(10) unsigned NOT NULL,
  `profile_id`         json             NOT NULL,
  `helper_user_id`     int(10) unsigned DEFAULT NULL,
  `created_on`         datetime         NOT NULL,
  `last_update`        timestamp        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status`             tinyint(4)       NOT NULL,
  `price_model`        tinyint(4) unsigned NOT NULL,
  `adult`              tinyint(3) unsigned NOT NULL,
  `meal`               tinyint(3) unsigned DEFAULT NULL,
  `stripe_customer_id` varchar(255)     NOT NULL DEFAULT '',
  `note`               varchar(255)     NOT NULL DEFAULT '',
  `checkin_time`       datetime         DEFAULT NULL,
  `total_people`       tinyint(3) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── register_meal ────────────────────────────────────────────────────────────
CREATE TABLE `register_meal` (
  `id`          int(10) unsigned NOT NULL AUTO_INCREMENT,
  `register_id` int(10) unsigned NOT NULL,
  `meal_id`     int(10) unsigned NOT NULL,
  `qty`         tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── register_profile ─────────────────────────────────────────────────────────
CREATE TABLE `register_profile` (
  `id`          bigint(20)       NOT NULL AUTO_INCREMENT,
  `profile_id`  int(10) unsigned NOT NULL,
  `register_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── meal_tracker ─────────────────────────────────────────────────────────────
CREATE TABLE `meal_tracker` (
  `id`           int(10) unsigned NOT NULL AUTO_INCREMENT,
  `LastModified` timestamp        NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `MealId`       int(10) unsigned DEFAULT NULL,
  `PersonId`     int(10) unsigned DEFAULT NULL,
  `Uid`          char(10)         DEFAULT NULL,
  `RegisterId`   int(10) unsigned DEFAULT NULL,
  `HouseholdId`  int(10) unsigned DEFAULT NULL,
  `LocationId`   int(10) unsigned DEFAULT NULL,
  `Remark`       varchar(255)     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DCY license actually limits "Total Under 2½ Years" and "Total Capacity"
-- (boundary 2.5yr = 30 months by birthday), NOT under-3 / 3+. Rename the columns
-- added in 20260705_capacity_ratio_and_center_license.sql (no data yet).
alter table menumaker.centers rename column license_under3_max to license_under2_5_max;
alter table menumaker.centers rename column license_3plus_max  to license_total_max;

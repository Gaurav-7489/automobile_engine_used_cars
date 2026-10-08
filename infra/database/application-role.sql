-- Run as the migration administrator after migrations. Set the login password
-- through your deployment's secret provisioning, not in this file.
CREATE ROLE vandlabs_app LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO vandlabs_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,dealerships,locations,vehicles,leads,tasks,journey_events,lead_activities,automation_rules,automation_runs,appointments TO vandlabs_app;

GRANT SELECT,INSERT ON sales,inventory_history TO vandlabs_app;
GRANT SELECT,INSERT,UPDATE ON stock_costs TO vandlabs_app;
GRANT SELECT,INSERT ON stock_cost_history TO vandlabs_app;

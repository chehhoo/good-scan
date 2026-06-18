package com.cccmbiz;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MealResourceTest {

    // ─── Static / no-DB endpoints ─────────────────────────────────────────────

    @Test
    @Order(1)
    void venues_returns200WithTwoVenues() {
        given()
            .when().get("/meal/venues")
            .then().statusCode(200)
            .body("$.size()", is(2))
            .body("[0].name", is("Westin"))
            .body("[1].name", is("Hilton"));
    }

    // ─── Church list ──────────────────────────────────────────────────────────

    @Test
    @Order(2)
    void churches_returns200WithTestChurch() {
        given()
            .when().get("/meal/churches")
            .then().statusCode(200)
            .body("$.size()", is(1))
            .body("[0].acronym", is("TESTCH"));
    }

    // ─── Meal info ────────────────────────────────────────────────────────────

    @Test
    @Order(3)
    void mealInfo_location1_returns3Meals() {
        given()
            .when().get("/meal/info/1")
            .then().statusCode(200)
            .body("meals.size()", is(3));
    }

    @Test
    @Order(4)
    void mealInfo_location2_returnsEmptyList() {
        given()
            .when().get("/meal/info/2")
            .then().statusCode(200)
            .body("meals.size()", is(0));
    }

    // ─── Pickup count ─────────────────────────────────────────────────────────

    @Test
    @Order(5)
    void mealCount_meal1_returns1() {
        given()
            .when().get("/meal/count/1")
            .then().statusCode(200)
            .body("mealId", is(1))
            .body("count", is(1));
    }

    @Test
    @Order(6)
    void mealCount_meal2_returns0() {
        given()
            .when().get("/meal/count/2")
            .then().statusCode(200)
            .body("count", is(0));
    }

    // ─── Meal plan (hardcoded IDs 48-56 not in test data → 204) ──────────────

    @Test
    @Order(7)
    void mealplan_noData_returns204() {
        given()
            .when().get("/meal/mealplan")
            .then().statusCode(204);
    }

    @Test
    @Order(8)
    void mealplan_byHouseholdId_noData_returns204() {
        given()
            .when().get("/meal/mealplan?householdId=1")
            .then().statusCode(204);
    }

    // ─── POST /status ─────────────────────────────────────────────────────────

    @Test
    @Order(9)
    void status_emptyId_returns400() {
        given().contentType(ContentType.JSON)
            .body("{\"id\": \"\"}")
            .when().post("/meal/status")
            .then().statusCode(400)
            .body("message", is("Empty Input ID"));
    }

    @Test
    @Order(10)
    void status_unknownPersonId_returns404() {
        given().contentType(ContentType.JSON)
            .body("{\"id\": \"9999\", \"mealId\": 1}")
            .when().post("/meal/status")
            .then().statusCode(404);
    }

    @Test
    @Order(11)
    void status_knownPersonId_returns200() {
        given().contentType(ContentType.JSON)
            .body("{\"id\": \"1001\", \"mealId\": 1}")
            .when().post("/meal/status")
            .then().statusCode(200)
            .body("householdId", is(1));
    }

    // ─── GET /status/{uid} ────────────────────────────────────────────────────

    @Test
    @Order(12)
    void statusByUid_known_returns200() {
        given()
            .when().get("/meal/status/ABC001")
            .then().statusCode(200)
            .body("householdId", is(1))
            .body("mealPlans.size()", is(3));
    }

    @Test
    @Order(13)
    void statusByUid_unknown_returns404() {
        given()
            .when().get("/meal/status/NOTFOUND")
            .then().statusCode(404);
    }

    // ─── POST /scan ───────────────────────────────────────────────────────────

    @Test
    @Order(14)
    void scan_nullId_returns400() {
        given().contentType(ContentType.JSON)
            .body("{\"mealId\": 1}")
            .when().post("/meal/scan")
            .then().statusCode(400);
    }

    @Test
    @Order(15)
    void scan_dinner_firstPickup_succeeds() {
        given().contentType(ContentType.JSON)
            .body("{\"id\": \"ABC001\", \"mealId\": 3}")
            .when().post("/meal/scan")
            .then().statusCode(200)
            .body("mealStatus", is(0))
            .body("mealOrdered", is(1))
            .body("mealTaken", is(1))
            .body("mealRemaining", is(0))
            .body("householdId", is(1));
    }

    @Test
    @Order(16)
    void scan_dinner_secondScan_exceedsQuota() {
        given().contentType(ContentType.JSON)
            .body("{\"id\": \"ABC001\", \"mealId\": 3}")
            .when().post("/meal/scan")
            .then().statusCode(200)
            .body("mealStatus", is(1))
            .body("mealOrdered", is(1))
            .body("mealTaken", is(1));
    }

    @Test
    @Order(17)
    void mealCount_meal3_reflectsPickup() {
        given()
            .when().get("/meal/count/3")
            .then().statusCode(200)
            .body("count", is(1));
    }
}

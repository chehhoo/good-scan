package com.cccmbiz;

import com.cccmbiz.domain.MealTracker;
import com.cccmbiz.dto.MealScanRequestDTO;
import com.cccmbiz.dto.MealScanResponseDTO;
import com.cccmbiz.dto.MealStatusResponseMealPlansDTO;
import com.cccmbiz.exception.MealException;
import com.cccmbiz.repository.MealTrackerRepository;
import com.cccmbiz.service.MealService;
import io.quarkus.test.TestTransaction;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class MealServiceTest {

    @Inject MealService mealService;
    @Inject MealTrackerRepository mealTrackerRepository;

    // ─── getMealIDByTime ──────────────────────────────────────────────────────

    @Test
    void getMealIdByTime_insideBreakfastWindow() {
        assertEquals(1, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 11, 7, 30)));
    }

    @Test
    void getMealIdByTime_atWindowStart_inclusive() {
        assertEquals(1, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 11, 7, 0)));
    }

    @Test
    void getMealIdByTime_atWindowEnd_exclusive() {
        assertEquals(0, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 11, 9, 0)));
    }

    @Test
    void getMealIdByTime_betweenMeals_returnsZero() {
        assertEquals(0, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 11, 10, 0)));
    }

    @Test
    void getMealIdByTime_insideLunchWindow() {
        assertEquals(2, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 11, 12, 30)));
    }

    @Test
    void getMealIdByTime_differentDate_returnsZero() {
        assertEquals(0, mealService.getMealIDByTime(LocalDateTime.of(2026, 7, 12, 7, 30)));
    }

    // ─── getHouseholdId ───────────────────────────────────────────────────────

    @Test
    void getHouseholdIdByUniqueId_known() {
        assertEquals(1, mealService.getHouseholdIdByUniqueId("ABC001"));
    }

    @Test
    void getHouseholdIdByUniqueId_unknown() {
        assertEquals(0, mealService.getHouseholdIdByUniqueId("NOTFOUND"));
    }

    @Test
    void getHouseholdIdByPersonId_known() {
        assertEquals(1, mealService.getHouseholdIdByPersonId(1001));
    }

    @Test
    void getHouseholdIdByPersonId_unknown() {
        assertEquals(0, mealService.getHouseholdIdByPersonId(9999));
    }

    // ─── getMealPickupCount ───────────────────────────────────────────────────

    @Test
    void getMealPickupCount_mealWithOnePickup() {
        assertEquals(1L, mealService.getMealPickupCount(1));
    }

    @Test
    void getMealPickupCount_mealWithNoPickups() {
        assertEquals(0L, mealService.getMealPickupCount(2));
    }

    // ─── getMealInformation ───────────────────────────────────────────────────

    @Test
    void getMealInformation_location1_returns3Meals() {
        assertEquals(3, mealService.getMealInformation(1).size());
    }

    @Test
    void getMealInformation_location2_returnsEmpty() {
        assertTrue(mealService.getMealInformation(2).isEmpty());
    }

    // ─── scan ─────────────────────────────────────────────────────────────────

    @Test
    @TestTransaction
    void scan_firstPickup_succeeds() throws MealException {
        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId("ABC001");
        req.setMealId(2);

        MealScanResponseDTO resp = mealService.scan(req);

        assertEquals(0, resp.getMealStatus());
        assertEquals(1, resp.getMealOrdered());
        assertEquals(1, resp.getMealTaken());
        assertEquals(0, resp.getMealRemaining());
        assertEquals(2, resp.getMealId());
        assertEquals(1, resp.getHouseholdId());
        assertNotNull(resp.getPickUpRecord());
        assertEquals(1, resp.getPickUpRecord().size());
    }

    @Test
    @TestTransaction
    void scan_withinRemainingQuota_succeeds() throws MealException {
        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId("ABC001");
        req.setMealId(1);

        MealScanResponseDTO resp = mealService.scan(req);

        assertEquals(0, resp.getMealStatus());
        assertEquals(2, resp.getMealOrdered());
        assertEquals(2, resp.getMealTaken());
        assertEquals(0, resp.getMealRemaining());
    }

    @Test
    @TestTransaction
    void scan_exceedsQuota_returnsMealStatus1() throws MealException {
        MealTracker extra = new MealTracker();
        extra.setMealId(1);
        extra.setPersonId(1001);
        extra.setUid("ABC001");
        extra.setRegisterId(1);
        extra.setHouseholdId(1);
        extra.setLocationId(1);
        extra.setLastModified(new Timestamp(System.currentTimeMillis()));
        extra.setRemark("John Doe");
        mealTrackerRepository.persist(extra);

        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId("ABC001");
        req.setMealId(1);

        MealScanResponseDTO resp = mealService.scan(req);

        assertEquals(1, resp.getMealStatus());
        assertEquals(2, resp.getMealOrdered());
        assertEquals(2, resp.getMealTaken());
        assertEquals(0, resp.getMealRemaining());
    }

    @Test
    void scan_unknownUid_throws404() {
        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId("NOTFOUND");
        req.setMealId(1);

        MealException ex = assertThrows(MealException.class, () -> mealService.scan(req));
        assertEquals(Response.Status.NOT_FOUND, ex.getStatus());
    }

    @Test
    void scan_nullRequest_throws400() {
        MealException ex = assertThrows(MealException.class, () -> mealService.scan(null));
        assertEquals(Response.Status.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void scan_nullId_throws400() {
        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId(null);
        req.setMealId(1);

        MealException ex = assertThrows(MealException.class, () -> mealService.scan(req));
        assertEquals(Response.Status.BAD_REQUEST, ex.getStatus());
    }

    @Test
    @TestTransaction
    void scan_noMealIdProvided_autoDetectsTime() throws MealException {
        MealScanRequestDTO req = new MealScanRequestDTO();
        req.setId("ABC001");
        req.setMealId(null);

        MealScanResponseDTO resp = mealService.scan(req);
        assertEquals(0, resp.getMealId());
    }

    // ─── retrieveAllMealPlanDetails ───────────────────────────────────────────

    @Test
    void retrieveAllMealPlanDetails_knownUid() throws MealException {
        List<MealStatusResponseMealPlansDTO> plans = mealService.retrieveAllMealPlanDetails("ABC001");
        assertEquals(3, plans.size());
    }

    @Test
    void retrieveAllMealPlanDetails_unknownUid_throws404() {
        MealException ex = assertThrows(MealException.class,
                () -> mealService.retrieveAllMealPlanDetails("NOTFOUND"));
        assertEquals(Response.Status.NOT_FOUND, ex.getStatus());
    }

    @Test
    void retrieveAllMealPlanDetails_unregisteredUid_throws404() {
        MealException ex = assertThrows(MealException.class,
                () -> mealService.retrieveAllMealPlanDetails("ABC002"));
        assertEquals(Response.Status.NOT_FOUND, ex.getStatus());
    }

    // ─── retrieveMealPlanDetails ──────────────────────────────────────────────

    @Test
    void retrieveMealPlanDetails_breakfastWithOnePickup() {
        MealStatusResponseMealPlansDTO plan = mealService.retrieveMealPlanDetails(1, 1);
        assertEquals(2, plan.getMealOrdered());
        assertEquals(1, plan.getMealTaken());
        assertEquals(1, plan.getMealRemaining());
        assertEquals(1, plan.getMealId());
    }

    @Test
    void retrieveMealPlanDetails_lunchWithNoPickups() {
        MealStatusResponseMealPlansDTO plan = mealService.retrieveMealPlanDetails(1, 2);
        assertEquals(1, plan.getMealOrdered());
        assertEquals(0, plan.getMealTaken());
        assertEquals(1, plan.getMealRemaining());
    }

    // ─── retrievePickupRecord ─────────────────────────────────────────────────

    @Test
    void retrievePickupRecord_returnsPreloadedRecord() {
        var records = mealService.retrievePickupRecord(1, 1);
        assertEquals(1, records.size());
        assertEquals(1001, records.get(0).getPersonId());
        assertEquals("John Doe", records.get(0).getName());
    }

    @Test
    void retrievePickupRecord_noPickups_returnsEmpty() {
        assertTrue(mealService.retrievePickupRecord(1, 2).isEmpty());
    }
}

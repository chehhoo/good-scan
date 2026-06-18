package com.cccmbiz.service;

import com.cccmbiz.domain.Meal;
import com.cccmbiz.domain.MealPlanView;
import com.cccmbiz.dto.*;
import com.cccmbiz.exception.MealException;

import java.time.LocalDateTime;
import java.util.List;

public interface MealService {
    List<Meal> getMealInformation(Integer location);
    Long getMealPickupCount(Integer mealId);
    Integer getHouseholdIdByPersonId(Integer id);
    Integer getHouseholdIdByUniqueId(String uid);
    List<MealPlanView> listAllMealPlan();
    List<MealPlanView> findMealPlanByHouseholdId(Integer householdId);
    MealScanResponseDTO scan(MealScanRequestDTO request) throws MealException;
    List<MealStatusResponseMealPlansDTO> retrieveAllMealPlanDetails(String uid) throws MealException;
    MealStatusResponseMealPlansDTO retrieveMealPlanDetails(Integer householdId, Integer mealId);
    List<MealScanResponsePickUpRecordDTO> retrievePickupRecordByRegisterId(Integer registerId, Integer mealId);
    List<MealScanResponsePickUpRecordDTO> retrievePickupRecord(Integer householdId, Integer mealId);
    Integer getMealIDByTime(LocalDateTime mealTime);
}

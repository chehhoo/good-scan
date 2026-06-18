package com.cccmbiz.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class MealScanResponseDTO {
    private Integer mealId;
    private int mealOrdered;
    private int mealTaken;
    private int mealRemaining;
    private int mealStatus;
    private int mealCount;
    private Integer householdId;
    private List<MealScanResponsePickUpRecordDTO> pickUpRecord;
    private List<MealStatusResponseMealPlansDTO> mealPlans;
}

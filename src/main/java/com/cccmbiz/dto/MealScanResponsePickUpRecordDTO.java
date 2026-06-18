package com.cccmbiz.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MealScanResponsePickUpRecordDTO {
    private Integer personId;
    private String pickUpDate;
    private String name;
    private Integer locationId;
}
